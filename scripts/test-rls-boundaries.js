const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const publicReadTables = [
  "programs", "projects", "stories", "news_posts", "reports", "cms_pages",
  "team_members", "media_assets", "impact_metrics", "impact_metric_history",
  "impact_program_outcomes", "impact_geographies", "impact_stories",
  "program_beneficiaries", "program_locations", "program_timeline",
  "program_gallery", "program_impact_metrics", "program_stories",
  "program_reports", "partners", "program_partners",
];

const roleProtectedTables = [
  "contact_submissions", "newsletter_subs", "volunteer_applications", "donations", "audit_logs",
];

const serverOnlyTables = [
  "analytics_events", "users", "auth_sessions", "email_verification_tokens",
  "password_reset_tokens", "donation_webhook_events", "schema_migrations",
  "user_auth_mapping",
];

const protectedTables = [...roleProtectedTables, ...serverOnlyTables];

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DATABASE_URL),
    application_name: "white-impact-rls-boundary-tests",
  });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT c.relname AS table_name,
              c.relrowsecurity AS rls_enabled,
              COALESCE(array_agg(DISTINCT p.cmd) FILTER (WHERE p.cmd IS NOT NULL), '{}') AS commands,
              COALESCE(array_agg(DISTINCT role_name) FILTER (WHERE role_name IS NOT NULL), '{}') AS roles
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
       LEFT JOIN LATERAL unnest(p.roles) AS role_name ON TRUE
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])
       GROUP BY c.relname, c.relrowsecurity`,
      [[...publicReadTables, ...protectedTables]],
    );

    const byTable = new Map(result.rows.map((row) => [row.table_name, row]));
    const failures = [];

    for (const table of [...publicReadTables, ...protectedTables]) {
      const row = byTable.get(table);
      if (!row?.rls_enabled) failures.push(`${table}: RLS is not enabled`);
    }

    for (const table of protectedTables) {
      const row = byTable.get(table);
      if ((row?.roles || []).includes("anon")) {
        failures.push(`${table}: anonymous policy must not exist`);
      }
    }

    for (const table of serverOnlyTables) {
      const row = byTable.get(table);
      if ((row?.commands || []).length > 0) {
        failures.push(`${table}: server-only table has a browser policy`);
      }
    }

    for (const table of publicReadTables) {
      const row = byTable.get(table);
      if (!(row?.commands || []).includes("SELECT")) {
        failures.push(`${table}: public read policy is missing`);
      }
    }

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-rls-boundary-tests",
      destructiveChanges: false,
      passed,
      publicReadTables: publicReadTables.length,
      protectedTables: protectedTables.length,
      roleProtectedTables: roleProtectedTables.length,
      serverOnlyTables: serverOnlyTables.length,
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-rls-boundary-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
  }, null, 2));
  process.exitCode = 1;
});
