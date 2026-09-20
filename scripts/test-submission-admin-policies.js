const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const submissions = [
  ["contact_submissions", "rbac_contact_select", "rbac_contact_update", "contact_submissions_set_updated_at"],
  ["volunteer_applications", "rbac_volunteer_select", "rbac_volunteer_update", "volunteer_applications_set_review_attribution"],
  ["newsletter_subs", "rbac_newsletter_select", "rbac_newsletter_update", "newsletter_subs_set_updated_at"],
];

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-submission-admin-policy-tests",
  });

  try {
    await client.connect();
    const tableNames = submissions.map(([table]) => table);
    const tables = await client.query(
      `SELECT relname, relrowsecurity
       FROM pg_class
       WHERE relnamespace = 'public'::regnamespace
         AND relname = ANY($1::text[])`,
      [tableNames],
    );
    const policies = await client.query(
      `SELECT tablename, policyname, cmd, roles
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])`,
      [tableNames],
    );
    const triggers = await client.query(
      `SELECT c.relname AS table_name, t.tgname AS trigger_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal
         AND c.relnamespace = 'public'::regnamespace
         AND c.relname = ANY($1::text[])`,
      [tableNames],
    );

    const failures = [];
    for (const [table, selectPolicy, updatePolicy, trigger] of submissions) {
      const tableInfo = tables.rows.find((row) => row.relname === table);
      if (!tableInfo?.relrowsecurity) failures.push(`${table}: RLS is not enabled`);
      for (const [policyName, command] of [[selectPolicy, "SELECT"], [updatePolicy, "UPDATE"]]) {
        const policy = policies.rows.find((row) => row.tablename === table && row.policyname === policyName);
        if (!policy || policy.cmd !== command || !policy.roles.includes("authenticated")) {
          failures.push(`${table}: ${policyName} is missing or not authenticated-only`);
        }
      }
      if (!triggers.rows.some((row) => row.table_name === table && row.trigger_name === trigger)) {
        failures.push(`${table}: ${trigger} is missing`);
      }
      const anonymousWrite = policies.rows.find(
        (row) => row.tablename === table && ["INSERT", "UPDATE", "DELETE", "ALL"].includes(row.cmd) && row.roles.includes("anon"),
      );
      if (anonymousWrite) failures.push(`${table}: anonymous ${anonymousWrite.cmd} policy exists`);
    }

    console.log(JSON.stringify({
      mode: "read-only-submission-admin-policy-tests",
      destructiveChanges: false,
      passed: failures.length === 0,
      tablesChecked: submissions.map(([table]) => table),
      failures,
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-submission-admin-policy-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
    message: error?.message || "unknown error",
  }, null, 2));
  process.exitCode = 1;
});
