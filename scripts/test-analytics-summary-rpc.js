const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-analytics-summary-rpc-tests",
  });

  try {
    await client.connect();
    const rpc = await client.query(
      `SELECT p.prosecdef AS security_definer,
              pg_get_function_identity_arguments(p.oid) AS arguments,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'get_analytics_summary'`,
    );
    const tablePolicies = await client.query(
      `SELECT policyname, cmd, roles
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'analytics_events'`,
    );

    const failures = [];
    const row = rpc.rows[0];
    if (!row) {
      failures.push("get_analytics_summary RPC is missing");
    } else {
      if (!row.security_definer) failures.push("get_analytics_summary must be SECURITY DEFINER");
      if (row.arguments !== "p_days integer") failures.push("get_analytics_summary argument shape mismatch");
      if (row.anon_execute) failures.push("get_analytics_summary must not be executable by anon");
      if (!row.authenticated_execute) failures.push("get_analytics_summary must be executable by authenticated");
    }
    if (tablePolicies.rows.some((policy) => policy.roles.includes("anon"))) {
      failures.push("analytics_events must not expose anon policies");
    }
    if (tablePolicies.rows.some((policy) => policy.cmd === "SELECT" && policy.roles.includes("authenticated"))) {
      failures.push("analytics_events raw SELECT must not be exposed to authenticated users");
    }

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-analytics-summary-rpc-tests",
      destructiveChanges: false,
      passed,
      rpcFound: Boolean(row),
      authenticatedExecute: Boolean(row?.authenticated_execute),
      anonExecute: Boolean(row?.anon_execute),
      rawAnalyticsPolicyCount: tablePolicies.rowCount,
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-analytics-summary-rpc-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
    errorMessage: error?.message || "test failed",
  }, null, 2));
  process.exitCode = 1;
});
