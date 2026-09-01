const express = require("express");
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const ALLOWED_EVENTS = new Set([
  "page_view",
  "report_download",
  "search",
  "newsletter_signup",
  "donation_started",
  "contact_submitted",
]);

function cleanMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .filter(([key, item]) =>
        /^[a-zA-Z0-9_-]{1,40}$/.test(key) &&
        ["string", "number", "boolean"].includes(typeof item),
      )
      .map(([key, item]) => [
        key,
        typeof item === "string" ? item.slice(0, 160) : item,
      ]),
  );
}

router.post("/events", async (req, res) => {
  const { eventKey, pagePath, referrer, sessionId, metadata } = req.body || {};
  if (!ALLOWED_EVENTS.has(eventKey)) {
    return res.status(400).json({ success: false, message: "Unsupported analytics event." });
  }

  try {
    await query(
      `INSERT INTO analytics_events (event_key, page_path, referrer, session_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        eventKey,
        typeof pagePath === "string" ? pagePath.slice(0, 255) : null,
        typeof referrer === "string" ? referrer.slice(0, 500) : null,
        typeof sessionId === "string" ? sessionId.slice(0, 120) : null,
        JSON.stringify(cleanMetadata(metadata)),
      ],
    );
    return res.status(202).json({ success: true });
  } catch (error) {
    console.error("Analytics event error:", error.message);
    return res.status(503).json({ success: false, message: "Analytics is temporarily unavailable." });
  }
});

router.get("/summary", requireAuth, requireRole("admin", "super_admin", "content_manager"), async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  try {
    const { rows } = await query(
      `SELECT event_key, COUNT(*)::int AS count
       FROM analytics_events
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY event_key
       ORDER BY count DESC, event_key ASC`,
      [days],
    );
    return res.json({ success: true, data: { days, events: rows } });
  } catch (error) {
    console.error("Analytics summary error:", error.message);
    return res.status(503).json({ success: false, message: "Analytics is temporarily unavailable." });
  }
});

module.exports = router;
