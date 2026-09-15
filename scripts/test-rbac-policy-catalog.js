const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const contentTables = [
  "programs", "projects", "news_posts", "cms_pages", "team_members",
  "media_assets", "impact_metrics", "impact_metric_history", "impact_program_outcomes",
  "impact_geographies", "impact_stories", "program_beneficiaries", "program_locations",
  "program_timeline", "program_gallery", "program_impact_metrics",
  "program_reports", "partners", "program_partners",
];

const sensitiveTables = [
  "users", "auth_sessions", "email_verification_tokens", "password_reset_tokens",
  "donation_webhook_events", "user_auth_mapping",
];

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-rbac-policy-tests",
  });

  try {
    await client.connect();
    const functions = await client.query(
      `SELECT proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND proname = ANY($1::text[])`,
      [[
        "get_current_application_user_id",
        "get_current_application_role",
        "is_content_manager",
        "is_finance_manager",
        "is_role_manager",
      ]],
    );
    const policies = await client.query(
      `SELECT tablename, policyname, cmd, roles
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])
       ORDER BY tablename, policyname`,
      [[...contentTables, ...sensitiveTables]],
    );

    const failures = [];
    if (functions.rowCount !== 5) failures.push("all RBAC helper functions are required");

    for (const table of contentTables) {
      const tablePolicies = policies.rows.filter((row) => row.tablename === table);
      for (const command of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        if (!tablePolicies.some((row) => row.cmd === command && row.roles.includes("authenticated"))) {
          failures.push(`${table}: missing authenticated ${command} policy`);
        }
      }
    }

    for (const table of sensitiveTables) {
      const tablePolicies = policies.rows.filter((row) => row.tablename === table);
      if (tablePolicies.some((row) => row.roles.includes("anon"))) {
        failures.push(`${table}: anonymous policy must not exist`);
      }
      if (["users", "auth_sessions", "email_verification_tokens", "password_reset_tokens", "donation_webhook_events", "user_auth_mapping"].includes(table)
        && tablePolicies.some((row) => ["INSERT", "UPDATE", "DELETE"].includes(row.cmd))) {
        failures.push(`${table}: browser write policy must not exist`);
      }
    }

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-rbac-policy-catalog-tests",
      destructiveChanges: false,
      passed,
      helperFunctions: functions.rowCount,
      contentTables: contentTables.length,
      sensitiveTables: sensitiveTables.length,
      policyCount: policies.rowCount,
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-rbac-policy-catalog-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
    errorMessage: error?.message || "test failed",
  }, null, 2));
  process.exitCode = 1;
});
