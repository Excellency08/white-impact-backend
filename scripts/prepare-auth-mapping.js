const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DATABASE_URL),
    application_name: "white-impact-auth-mapping-preflight",
  });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT u.role,
              COUNT(*)::int AS eligible_users,
              COUNT(m.user_id)::int AS already_mapped
       FROM public.users u
       LEFT JOIN public.user_auth_mapping m ON m.user_id = u.id
       WHERE u.is_active = TRUE AND u.is_email_verified = TRUE
       GROUP BY u.role
       ORDER BY u.role`,
    );

    const totals = result.rows.reduce(
      (summary, row) => ({
        eligibleUsers: summary.eligibleUsers + row.eligible_users,
        alreadyMapped: summary.alreadyMapped + row.already_mapped,
      }),
      { eligibleUsers: 0, alreadyMapped: 0 },
    );

    console.log(JSON.stringify({
      mode: "read-only-auth-mapping-preflight",
      destructiveChanges: false,
      rowsByRole: result.rows,
      totals,
      unmappedEligibleUsers: totals.eligibleUsers - totals.alreadyMapped,
      actionTaken: "none",
      passwordMigration: "not-performed",
      emailDelivery: "not-triggered",
    }, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-auth-mapping-preflight",
    destructiveChanges: false,
    status: "preflight-failed",
    errorCode: error?.code || error?.errno || "preflight-failed",
  }, null, 2));
  process.exitCode = 1;
});

