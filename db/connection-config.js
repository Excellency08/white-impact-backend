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
  const config = {
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT) || 10000,
    ssl: getSslConfig(),
  };

  if (connectionString?.trim()) {
    return { ...config, connectionString: connectionString.trim() };
  }

  return {
    ...config,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "whiteimpact",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  };
}

module.exports = { createPoolConfig };
