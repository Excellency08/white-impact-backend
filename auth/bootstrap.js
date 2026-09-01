const argon2 = require("argon2");

async function ensureBootstrapAdmin(pool) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Bootstrap Admin";
  const role = process.env.BOOTSTRAP_ADMIN_ROLE?.trim() || "super_admin";

  if (!email || !password) {
    return { created: false, reason: "bootstrap credentials not configured" };
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [email]
  );

  if (existing.rows.length > 0) {
    return { created: false, reason: "bootstrap admin already exists" };
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const { rows } = await pool.query(
    `INSERT INTO users (
      full_name, email, password_hash, role, is_active, is_email_verified, email_verified_at
    ) VALUES ($1, $2, $3, $4, TRUE, TRUE, NOW())
    RETURNING id, email, role`,
    [fullName, email, passwordHash, role]
  );

  return { created: true, user: rows[0] };
}

module.exports = {
  ensureBootstrapAdmin,
};

