const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "whiteimpact",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "2514",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB] ${text.substring(0, 60)}… (${duration}ms, ${res.rowCount || 0} rows)`);
    return res;
  } catch (error) {
    console.error("❌ Database Query Error:", error.message);
    throw error;
  }
}

async function initDB() {
  try {
    console.log("🔌 Connecting to PostgreSQL…");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected.");

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255),
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS newsletter_subs (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        subscribed_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS donations (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(20),
        amount_kobo BIGINT,
        amount_naira INT,
        program_area VARCHAR(255),
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        paystack_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        verified_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255),
        role VARCHAR(255),
        bio TEXT,
        photo_url VARCHAR(500),
        display_order INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Database schema ready.");

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
  } catch (error) {
    console.error("❌ Database initialization error:", error.message);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  initDB,
};
