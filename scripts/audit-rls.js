const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const migrationsDir = path.join(__dirname, "..", "db", "migrations");
const expectedTables = [...new Set(
  fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .flatMap((file) => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map(
        (match) => match[1].toLowerCase(),
      );
    }),
)].sort();

function safeErrorCode(error) {
  return error?.code || error?.errno || "connection-failed";
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-rls-audit",
  });

  try {
    await client.connect();
    const tableResult = await client.query(
      `SELECT
         c.relname AS table_name,
         c.relrowsecurity AS rls_enabled,
         c.relforcerowsecurity AS force_rls,
         COALESCE(
           json_agg(
             json_build_object(
               'name', p.policyname,
               'command', p.cmd,
               'roles', p.roles,
               'permissive', p.permissive
             ) ORDER BY p.policyname
           ) FILTER (WHERE p.policyname IS NOT NULL),
           '[]'::json
         ) AS policies
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_policies p
         ON p.schemaname = n.nspname
        AND p.tablename = c.relname
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
       ORDER BY c.relname`,
      [expectedTables],
    );

    const rowsByName = new Map(tableResult.rows.map((row) => [row.table_name, row]));
    const tables = expectedTables.map((tableName) => rowsByName.get(tableName) || {
      table_name: tableName,
      missing: true,
      rls_enabled: false,
      force_rls: false,
      policies: [],
    });

    console.log(JSON.stringify({
      mode: "read-only-rls-audit",
      destructiveChanges: false,
      tables,
      summary: {
        expectedTables: expectedTables.length,
        foundTables: tableResult.rowCount,
        rlsEnabled: tables.filter((table) => table.rls_enabled).length,
        tablesWithPolicies: tables.filter((table) => table.policies.length > 0).length,
      },
    }, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-rls-audit",
    destructiveChanges: false,
    status: "audit-failed",
    errorCode: safeErrorCode(error),
  }, null, 2));
  process.exitCode = 1;
});
