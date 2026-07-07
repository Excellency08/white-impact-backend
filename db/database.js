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

let fallbackMode = false;
const fallbackStore = {
  contact_submissions: [],
  newsletter_subs: [],
  donations: [],
  team_members: [],
};

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
});

function seedFallbackTeamMembers() {
  if (fallbackStore.team_members.length > 0) return;

  fallbackStore.team_members = [
    {
      id: 1,
      full_name: "Dr. Amina Yusuf",
      role: "Executive Director",
      bio: "Leading White Impact Initiative with vision for sustainable development.",
      display_order: 1,
      is_active: true,
      photo_url: null,
      created_at: new Date(),
    },
    {
      id: 2,
      full_name: "Emmanuel Okonkwo",
      role: "Program Manager",
      bio: "Oversees all development programs and partnerships.",
      display_order: 2,
      is_active: true,
      photo_url: null,
      created_at: new Date(),
    },
    {
      id: 3,
      full_name: "Fatima Bello",
      role: "Finance Officer",
      bio: "Manages financial operations and compliance.",
      display_order: 3,
      is_active: true,
      photo_url: null,
      created_at: new Date(),
    },
    {
      id: 4,
      full_name: "Chidi Nwosu",
      role: "Communications Lead",
      bio: "Drives strategic communications and public engagement.",
      display_order: 4,
      is_active: true,
      photo_url: null,
      created_at: new Date(),
    },
  ];
}

function fallbackQuery(text, params = []) {
  const sql = text.trim();
  const normalized = sql.toLowerCase();

  if (normalized.includes("select now()")) {
    return { rows: [{ now: new Date() }] };
  }

  if (normalized.includes("select count(*) from team_members")) {
    return { rows: [{ count: fallbackStore.team_members.length }] };
  }

  if (normalized.includes("from donations")) {
    let rows = [...fallbackStore.donations];
    if (normalized.includes("where reference =")) {
      rows = rows.filter((row) => row.reference === params[0]);
    }
    if (normalized.includes("order by created_at desc")) {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (normalized.includes("limit")) {
      const limitMatch = sql.match(/limit\s+(\d+)/i);
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : rows.length;
      rows = rows.slice(0, limit);
    }
    return { rows };
  }

  if (normalized.includes("from contact_submissions")) {
    let rows = [...fallbackStore.contact_submissions];
    if (normalized.includes("order by created_at desc")) {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (normalized.includes("limit")) {
      const limitMatch = sql.match(/limit\s+(\d+)/i);
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : rows.length;
      rows = rows.slice(0, limit);
    }
    return { rows };
  }

  if (normalized.includes("from newsletter_subs")) {
    return { rows: [...fallbackStore.newsletter_subs] };
  }

  if (normalized.includes("from team_members")) {
    let rows = fallbackStore.team_members.filter((row) => row.is_active !== false);
    if (normalized.includes("where is_active = true")) {
      rows = rows.filter((row) => row.is_active === true);
    }
    if (normalized.includes("order by display_order asc")) {
      rows.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    }
    return { rows };
  }

  if (normalized.startsWith("insert into donations")) {
    const nextId = fallbackStore.donations.length + 1;
    const donation = {
      id: nextId,
      reference: params[0],
      full_name: params[1],
      email: params[2],
      phone: params[3],
      amount_kobo: params[4],
      amount_naira: Math.round(Number(params[4]) / 100),
      program_area: params[5],
      message: params[6],
      status: "pending",
      receipt_url: null,
      created_at: new Date(),
      verified_at: null,
    };
    fallbackStore.donations.push(donation);
    return { rows: [{ id: donation.id, amount_naira: donation.amount_naira }] };
  }

  if (normalized.startsWith("insert into contact_submissions")) {
    const nextId = fallbackStore.contact_submissions.length + 1;
    const submission = {
      id: nextId,
      full_name: params[0],
      email: params[1],
      subject: params[2],
      message: params[3],
      status: "pending",
      created_at: new Date(),
    };
    fallbackStore.contact_submissions.push(submission);
    return { rows: [{ id: submission.id, created_at: submission.created_at }] };
  }

  if (normalized.startsWith("insert into newsletter_subs")) {
    const existing = fallbackStore.newsletter_subs.find((entry) => entry.email === params[0]);
    if (existing) {
      existing.is_active = true;
      return { rows: [existing] };
    }
    const subscription = {
      email: params[0],
      subscribed_at: new Date(),
      is_active: true,
    };
    fallbackStore.newsletter_subs.push(subscription);
    return { rows: [subscription] };
  }

  if (normalized.startsWith("insert into team_members")) {
    const nextId = fallbackStore.team_members.length + 1;
    const teamMember = {
      id: nextId,
      full_name: params[0],
      role: params[1],
      bio: params[2],
      display_order: params[3],
      is_active: params[4] === true || params[4] === "TRUE",
      created_at: new Date(),
    };
    fallbackStore.team_members.push(teamMember);
    return { rows: [teamMember] };
  }

  if (normalized.startsWith("update donations")) {
    const reference = params[0];
    const donation = fallbackStore.donations.find((entry) => entry.reference === reference);
    if (!donation) return { rowCount: 0, rows: [] };
    if (params[1] !== undefined) donation.status = params[1];
    if (params[2] !== undefined) donation.receipt_url = params[2];
    return { rowCount: 1, rows: [donation] };
  }

  if (normalized.startsWith("update newsletter_subs")) {
    const newsletter = fallbackStore.newsletter_subs.find((entry) => entry.email === params[0]);
    if (!newsletter) return { rowCount: 0, rows: [] };
    newsletter.is_active = false;
    return { rowCount: 1, rows: [newsletter] };
  }

  if (normalized.startsWith("update team_members")) {
    const teamMember = fallbackStore.team_members.find((entry) => String(entry.id) === String(params[1]));
    if (!teamMember) return { rowCount: 0, rows: [] };
    teamMember.photo_url = params[0];
    return { rowCount: 1, rows: [teamMember] };
  }

  if (normalized.startsWith("create table") || normalized.startsWith("alter table")) {
    return { rows: [] };
  }

  return { rows: [] };
}

async function query(text, params = []) {
  const start = Date.now();

  if (fallbackMode) {
    const res = fallbackQuery(text, params);
    const duration = Date.now() - start;
    console.log(`[DB:FALLBACK] ${text.substring(0, 60)}… (${duration}ms, ${res.rows?.length || res.rowCount || 0} rows)`);
    return res;
  }

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB] ${text.substring(0, 60)}… (${duration}ms, ${res.rowCount || 0} rows)`);
    return res;
  } catch (error) {
    const isConnectionIssue = error?.code === "ECONNREFUSED" || error?.message?.includes("connect") || error?.message?.includes("Connection terminated");
    if (isConnectionIssue) {
      fallbackMode = true;
      console.warn("⚠️ PostgreSQL unavailable; using local fallback storage for this session.");
      return fallbackQuery(text, params);
    }
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
        receipt_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        verified_at TIMESTAMP
      );

      ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(500);

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
    fallbackMode = true;
    seedFallbackTeamMembers();
    console.warn("⚠️ PostgreSQL unavailable; using local fallback storage for this session.");
  }
}

module.exports = {
  pool,
  query,
  initDB,
};
