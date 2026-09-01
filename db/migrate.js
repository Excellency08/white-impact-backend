const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { createPoolConfig } = require("./connection-config");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function runMigrations(client) {
  const migrationsDir = path.join(__dirname, "migrations");
  const schemaTableSql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  await client.query(schemaTableSql);

  const { rows: appliedRows } = await client.query(
    "SELECT filename FROM schema_migrations ORDER BY filename ASC",
  );
  const applied = new Set(appliedRows.map((row) => row.filename));

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of migrationFiles) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`🧩 Applying migration ${file}`);

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      console.log(`✅ Applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
}

module.exports = {
  runMigrations,
};

if (require.main === module) {
  const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const pool = new Pool(createPoolConfig(migrationUrl));

  (async () => {
    try {
      const client = await pool.connect();
      try {
        await runMigrations(client);
        console.log("✅ Migration run complete.");
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("❌ Migration failed:", error.message);
      process.exitCode = 1;
    } finally {
      await pool.end().catch(() => {});
    }
  })();
}
