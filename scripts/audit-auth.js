const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const roles = [
  "super_admin",
  "admin",
  "editor",
  "content_manager",
  "program_manager",
  "finance_manager",
  "viewer",
];

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DATABASE_URL),
    application_name: "white-impact-auth-audit",
  });

  try {
    await client.connect();
    const users = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_active)::int AS active,
              COUNT(*) FILTER (WHERE is_email_verified)::int AS verified
       FROM public.users`,
    );
    const roleCounts = await client.query(
      `SELECT role, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE is_active)::int AS active
       FROM public.users
       GROUP BY role
       ORDER BY role`,
    );
    const sessions = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE NOT is_revoked AND expires_at > NOW())::int AS active
       FROM public.auth_sessions`,
    );

    let authUsers = { available: false, total: null };
    try {
      const result = await client.query("SELECT COUNT(*)::int AS total FROM auth.users");
      authUsers = { available: true, total: result.rows[0].total };
    } catch {
      // Some database roles cannot inspect the managed auth schema.
    }

    const mapping = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE u.is_active AND u.is_email_verified)::int AS eligible
       FROM public.user_auth_mapping m
       JOIN public.users u ON u.id = m.user_id`,
    );

    console.log(JSON.stringify({
      mode: "read-only-auth-audit",
      destructiveChanges: false,
      applicationUserTable: users.rows[0],
      roleCounts: roleCounts.rows,
      knownRoles: roles,
      sessions: sessions.rows[0],
      supabaseAuthUsers: authUsers,
      mapping: {
        mappingColumnPresent: false,
        mappingTablePresent: true,
        mappedUsers: mapping.rows[0].total,
        mappedEligibleUsers: mapping.rows[0].eligible,
        existingIdType: "integer",
        supabaseAuthIdType: "uuid",
      },
    }, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-auth-audit",
    destructiveChanges: false,
    status: "audit-failed",
    errorCode: error?.code || error?.errno || "audit-failed",
  }, null, 2));
  process.exitCode = 1;
});
