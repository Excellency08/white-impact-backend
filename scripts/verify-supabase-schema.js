const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const migrationsDir = path.join(__dirname, "..", "db", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const expectedTables = [...new Set(
  migrationFiles.flatMap((file) => {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map(
      (match) => match[1].toLowerCase(),
    );
  }),
)].sort();

function safeErrorCode(error) {
  if (error?.code === "ENOTFOUND") return "host-unreachable";
  if (error?.code === "ETIMEDOUT" || error?.code === "ECONNRESET") return "connection-timeout";
  if (error?.code === "28P01") return "authentication-failed";
  if (error?.code === "28000") return "authorization-failed";
  return "connection-failed";
}

function safeErrorDetails(error) {
  return {
    category: safeErrorCode(error),
    postgresCode: error?.code || null,
    systemCode: error?.errno || null,
    syscall: error?.syscall || null,
  };
}

async function inspectConnection(name, connectionString) {
  if (!connectionString?.trim()) {
    return { name, status: "not-configured" };
  }

  const client = new Client({
    ...createPoolConfig(connectionString),
    application_name: "white-impact-schema-verifier",
    connectionTimeoutMillis: Math.min(
      Number(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      10000,
    ),
  });

  try {
    await client.connect();
    const [tablesResult, schemaResult] = await Promise.all([
      client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
      ),
      client.query("SELECT current_schema() AS schema_name"),
    ]);
    const remoteTables = tablesResult.rows.map((row) => row.table_name.toLowerCase());
    const missingTables = expectedTables.filter((table) => !remoteTables.includes(table));

    return {
      name,
      status: missingTables.length ? "connected-schema-incomplete" : "connected",
      schema: schemaResult.rows[0]?.schema_name || "unknown",
      remoteTableCount: remoteTables.length,
      expectedTableCount: expectedTables.length,
      missingTables,
    };
  } catch (error) {
    return { name, status: "connection-failed", error: safeErrorDetails(error) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const results = await Promise.all([
    inspectConnection("DATABASE_URL", process.env.DATABASE_URL),
    inspectConnection("DIRECT_URL", process.env.DIRECT_URL),
  ]);

  console.log(JSON.stringify({
    mode: "read-only-schema-verification",
    destructiveChanges: false,
    expectedTableCount: expectedTables.length,
    results,
  }, null, 2));

  if (results.some((result) => result.status !== "connected")) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.log(JSON.stringify({
    mode: "read-only-schema-verification",
    destructiveChanges: false,
    status: "verification-failed",
  }, null, 2));
  process.exitCode = 1;
});
