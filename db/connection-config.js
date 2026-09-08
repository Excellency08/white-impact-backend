function getSslConfig() {
  const enabled = String(process.env.DB_SSL || "").toLowerCase() === "true";
  if (!enabled) return undefined;

  return {
    // Supabase's hosted certificate chain is validated by the platform.
    // Set DB_SSL_CA when strict certificate pinning is required.
    rejectUnauthorized: Boolean(process.env.DB_SSL_CA),
    ca: process.env.DB_SSL_CA || undefined,
  };
}

function createPoolConfig(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) {
    throw new Error("DATABASE_URL is required for the Supabase PostgreSQL connection.");
  }

  const config = {
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT) || 10000,
    ssl: getSslConfig(),
  };

  return { ...config, connectionString: connectionString.trim() };
}

module.exports = { createPoolConfig };
