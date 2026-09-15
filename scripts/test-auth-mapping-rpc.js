const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const functionName = "public.link_current_auth_user()";

function safeErrorCode(error) {
  return error?.code || error?.errno || "test-failed";
}

function safeErrorMessage(error) {
  return typeof error?.message === "string" ? error.message.slice(0, 160) : "test failed";
}

async function expectRejected(client, label, setupSql, actionSql, failures) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE " + setupSql.role);
    if (setupSql.claim !== undefined) {
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [setupSql.claim]);
    }
    await client.query(actionSql);
    failures.push(`${label} unexpectedly succeeded`);
  } catch {
    // Any database rejection is a safe result for these negative cases.
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new Client({
    ...createPoolConfig(process.env.DATABASE_URL),
    application_name: "white-impact-auth-mapping-rpc-tests",
  });
  const failures = [];
  let transactionStarted = false;

  try {
    await client.connect();

    const functionResult = await client.query(
      `SELECT p.prosecdef,
              p.pronargs,
              p.proconfig,
              has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated_execute,
              COALESCE(EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.proacl, ARRAY[]::aclitem[])) AS acl
                WHERE acl::TEXT LIKE '=X/%'
              ), FALSE) AS public_execute,
              COALESCE(EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.proacl, ARRAY[]::aclitem[])) AS acl
                WHERE acl::TEXT LIKE 'anon=X/%'
              ), FALSE) AS anon_execute,
              COALESCE(EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p.proacl, ARRAY[]::aclitem[])) AS acl
                WHERE acl::TEXT LIKE 'service_role=X/%'
              ), FALSE) AS service_role_execute
       FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'link_current_auth_user'`,
      [functionName],
    );
    const rpcFunction = functionResult.rows[0];
    if (!rpcFunction) failures.push("mapping RPC is missing");
    if (rpcFunction && !rpcFunction.prosecdef) failures.push("mapping RPC must be SECURITY DEFINER");
    if (rpcFunction && rpcFunction.pronargs !== 0) failures.push("mapping RPC must not accept browser arguments");
    if (rpcFunction && !(rpcFunction.proconfig || []).some((item) => item === "search_path=pg_catalog, public, auth")) {
      failures.push("mapping RPC search_path is not fixed");
    }
    if (rpcFunction && !rpcFunction.authenticated_execute) failures.push("authenticated must be able to execute the RPC");
    if (rpcFunction && rpcFunction.public_execute) failures.push("PUBLIC must not be able to execute the RPC");

    if (rpcFunction?.anon_execute) failures.push("anon must not be able to execute the RPC");
    if (rpcFunction?.service_role_execute) failures.push("service_role must not be able to execute the RPC");

    const tableResult = await client.query(
      `SELECT c.relrowsecurity AS rls_enabled,
              EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'user_auth_mapping'
                  AND cmd = 'INSERT'
                  AND 'anon' = ANY(roles)
              ) AS anon_insert_policy,
              EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'user_auth_mapping'
                  AND cmd = 'INSERT'
                  AND 'authenticated' = ANY(roles)
              ) AS authenticated_insert_policy
       FROM pg_class AS c
       JOIN pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'user_auth_mapping'`,
    );
    const table = tableResult.rows[0];
    if (!table?.rls_enabled) failures.push("user_auth_mapping must keep RLS enabled");
    if (table?.anon_insert_policy) failures.push("anonymous INSERT policy on user_auth_mapping must remain blocked");
    if (table?.authenticated_insert_policy) failures.push("authenticated INSERT policy on user_auth_mapping must remain blocked");

    await expectRejected(
      client,
      "anonymous RPC execution",
      { role: "anon", claim: "00000000-0000-0000-0000-000000000001" },
      "SELECT * FROM public.link_current_auth_user()",
      failures,
    );
    await expectRejected(
      client,
      "unauthenticated RPC execution",
      { role: "authenticated", claim: "" },
      "SELECT * FROM public.link_current_auth_user()",
      failures,
    );
    await expectRejected(
      client,
      "anonymous mapping INSERT",
      { role: "anon", claim: "" },
      "INSERT INTO public.user_auth_mapping (user_id, auth_user_id) VALUES (0, '00000000-0000-0000-0000-000000000001')",
      failures,
    );
    await expectRejected(
      client,
      "authenticated mapping INSERT",
      { role: "authenticated", claim: "00000000-0000-0000-0000-000000000001" },
      "INSERT INTO public.user_auth_mapping (user_id, auth_user_id) VALUES (0, '00000000-0000-0000-0000-000000000001')",
      failures,
    );

    const constraints = await client.query(
      `SELECT COUNT(*) FILTER (WHERE conname = 'user_auth_mapping_pkey')::INTEGER AS primary_key,
              COUNT(*) FILTER (WHERE conname = 'user_auth_mapping_auth_user_id_key')::INTEGER AS auth_unique
       FROM pg_constraint AS c
       JOIN pg_class AS t ON t.oid = c.conrelid
       JOIN pg_namespace AS n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public' AND t.relname = 'user_auth_mapping'`,
    );
    if (constraints.rows[0]?.primary_key !== 1) failures.push("user_id primary key constraint is missing");
    if (constraints.rows[0]?.auth_unique !== 1) failures.push("auth_user_id unique constraint is missing");

    /*
     * Exercise the real function only inside a transaction and roll it back.
     * No mapping is persisted by this test. Identifiers are never printed.
     */
    const candidate = await client.query(
      `SELECT a.id AS auth_user_id
       FROM auth.users AS a
       JOIN public.users AS u
         ON lower(pg_catalog.btrim(u.email)) = lower(pg_catalog.btrim(a.email))
       WHERE a.email_confirmed_at IS NOT NULL
         AND u.is_active = TRUE
         AND u.is_email_verified = TRUE
       LIMIT 1`,
    );

    if (candidate.rowCount === 1) {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [candidate.rows[0].auth_user_id]);

      const first = await client.query("SELECT * FROM public.link_current_auth_user()");
      const second = await client.query("SELECT * FROM public.link_current_auth_user()");
      if (first.rowCount !== 1 || second.rowCount !== 1) failures.push("authenticated mapping RPC did not return one row");
      if (second.rows[0]?.mapping_status !== "already_linked") {
        failures.push("mapping RPC is not idempotent");
      }

      await client.query("ROLLBACK");
      transactionStarted = false;
    }

    console.log(JSON.stringify({
      mode: "rollback-safe-auth-mapping-rpc-tests",
      destructiveChanges: false,
      passed: failures.length === 0,
      functionSecurity: {
        exists: Boolean(rpcFunction),
        securityDefiner: Boolean(rpcFunction?.prosecdef),
        argumentCount: rpcFunction?.pronargs ?? null,
        authenticatedExecute: Boolean(rpcFunction?.authenticated_execute),
        publicExecute: Boolean(rpcFunction?.public_execute),
      },
      mappingConstraints: {
        rlsEnabled: Boolean(table?.rls_enabled),
        anonymousInsertPolicy: Boolean(table?.anon_insert_policy),
        authenticatedInsertPolicy: Boolean(table?.authenticated_insert_policy),
        userPrimaryKey: constraints.rows[0]?.primary_key === 1,
        authUserUniqueKey: constraints.rows[0]?.auth_unique === 1,
      },
      rollbackSafePositiveTest: candidate.rowCount === 1 ? "passed" : "skipped-no-verified-pair",
      failures,
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "rollback-safe-auth-mapping-rpc-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: safeErrorCode(error),
    errorMessage: safeErrorMessage(error),
  }, null, 2));
  process.exitCode = 1;
});
