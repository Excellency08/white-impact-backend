const { query } = require("../db/database");

async function logAudit({
  actor = null,
  action,
  entityType,
  entityId = null,
  summary = "",
  metadata = {},
  req = null,
}) {
  try {
    await query(
      `INSERT INTO audit_logs (
        actor_id, actor_email, actor_role, action, entity_type, entity_id,
        summary, metadata, ip_address, user_agent
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        actor?.id || null,
        actor?.email || null,
        actor?.role || null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        summary || null,
        JSON.stringify(metadata || {}),
        req?.ip || req?.socket?.remoteAddress || null,
        req?.get?.("user-agent") || null,
      ],
    );
  } catch (error) {
    console.error("Audit log error:", error.message);
  }
}

module.exports = { logAudit };
