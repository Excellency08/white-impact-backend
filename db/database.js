const { Pool } = require("pg");
const { runMigrations } = require("./migrate");
const { ensureBootstrapAdmin } = require("../auth/bootstrap");
const { logEntry } = require("../middleware/logger");
const { createPoolConfig } = require("./connection-config");

const pool = new Pool(createPoolConfig());

async function connectWithRetry() {
  const maxAttempts = Math.max(1, Number(process.env.DB_CONNECTION_RETRIES) || 3);
  const retryDelayMs = Math.max(250, Number(process.env.DB_CONNECTION_RETRY_DELAY) || 1500);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client;
    try {
      client = await pool.connect();
      await client.query("SELECT NOW()");
      return client;
    } catch (error) {
      client?.release();
      lastError = error;
      if (attempt === maxAttempts) break;
      console.warn(`⚠️ PostgreSQL connection attempt ${attempt} failed; retrying…`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError;
}

pool.on("error", (err) => {
  logEntry("error", "database_idle_client_error", { message: err.message });
});

async function query(text, params = []) {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logEntry("info", "database_query", {
      durationMs: duration,
      rowCount: res.rowCount || 0,
    });
    return res;
  } catch (error) {
    logEntry("error", "database_query_failed", { message: error.message });
    throw error;
  }
}

async function initDB() {
  let client;
  try {
    client = await connectWithRetry();
    console.log("🔌 Connecting to PostgreSQL…");
    console.log("✅ Database connected.");

    await runMigrations(client);
    console.log("✅ Database schema ready.");
  } catch (error) {
    console.error(
      "❌ PostgreSQL initialization failed. The application requires a live database.",
      error.message,
    );
    throw error;
  } finally {
    client?.release();
  }

  // Seed default team members if table is empty
  const teamCheck = await pool.query("SELECT COUNT(*) FROM team_members");
  if (teamCheck.rows[0].count == 0) {
    await pool.query(`
      INSERT INTO team_members (full_name, role, bio, display_order, is_active)
      VALUES
        ('Dr. Amina Yusuf', 'Executive Director', 'Leading White Impact Initiative with vision for sustainable development.', 1, TRUE),
        ('Emmanuel Okonkwo', 'Program Manager', 'Oversees all development programs and partnerships.', 2, TRUE),
        ('Fatima Bello', 'Finance Officer', 'Manages financial operations and compliance.', 3, TRUE),
        ('Chidi Nwosu', 'Communications Lead', 'Drives strategic communications and public engagement.', 4, TRUE);
    `);
    console.log("✅ Default team members seeded.");
  }

  const bootstrapResult = await ensureBootstrapAdmin(pool);
  if (bootstrapResult.created) {
    console.log(`✅ Bootstrap admin created for ${bootstrapResult.user.email}`);
  }
}

module.exports = {
  pool,
  query,
  initDB,
};
