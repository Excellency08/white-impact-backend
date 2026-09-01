/**
 * Newsletter subscriptions with confirmation and unsubscribe tokens.
 */

const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../middleware/audit");
const { validateNewsletterForm } = require("../middleware/validators");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireNewsletterAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    requireRole(...ADMIN_ROLES)(req, res, next),
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function formatNewsletter(row) {
  return {
    id: row.id,
    fullName: row.full_name || "",
    email: row.email,
    sourcePage: row.source_page || "website",
    status: row.status || (row.is_active ? "confirmed" : "unsubscribed"),
    subscribedAt: row.subscribed_at,
    confirmationSentAt: row.confirmation_sent_at || null,
    confirmedAt: row.confirmed_at || null,
    unsubscribedAt: row.unsubscribed_at || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function issueTokens({ email, fullName, sourcePage }) {
  const confirmationToken = generateToken(32);
  const unsubscribeToken = generateToken(32);

  await query(
    `UPDATE newsletter_subs
     SET confirmation_token_hash = $2,
         unsubscribe_token_hash = $3,
         confirmation_sent_at = NOW(),
         source_page = COALESCE($4, source_page),
         full_name = COALESCE($5, full_name),
         status = 'pending',
         is_active = FALSE,
         confirmed_at = NULL,
         unsubscribed_at = NULL,
         updated_at = NOW()
     WHERE email = $1`,
    [email, sha256(confirmationToken), sha256(unsubscribeToken), sourcePage, fullName],
  );

  return { confirmationToken, unsubscribeToken };
}

router.get("/health", (_req, res) => {
  res.json({ success: true, service: "newsletter", status: "ok" });
});

router.post("/", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const fullName = String(req.body.fullName || req.body.full_name || "").trim();
  const sourcePage = String(req.body.sourcePage || req.body.source_page || "website").trim() || "website";
  const validation = validateNewsletterForm({ email });

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.errors[0] || "Please provide a valid email address.",
    });
  }

  try {
    await query(
      `INSERT INTO newsletter_subs (email, full_name, source_page, status, is_active)
       VALUES ($1, $2, $3, 'pending', FALSE)
       ON CONFLICT (email) DO UPDATE SET
         full_name = COALESCE(EXCLUDED.full_name, newsletter_subs.full_name),
         source_page = COALESCE(EXCLUDED.source_page, newsletter_subs.source_page),
         status = 'pending',
         is_active = FALSE,
         updated_at = NOW()`,
      [email, fullName || null, sourcePage],
    );

    const tokens = await issueTokens({ email, fullName, sourcePage });
    const baseUrl =
      process.env.SITE_URL ||
      process.env.FRONTEND_URL ||
      "https://whiteimpactinitiative.org";

    const confirmUrl = `${baseUrl.replace(/\/$/, "")}/newsletter-confirmation.html?token=${encodeURIComponent(tokens.confirmationToken)}`;
    const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/newsletter-unsubscribe.html?token=${encodeURIComponent(tokens.unsubscribeToken)}`;

    sendEmail({
      to: email,
      subject: "Confirm your White Impact newsletter subscription",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <h2>Confirm your subscription</h2>
          <p>Hi ${fullName || "there"},</p>
          <p>Please confirm your subscription to receive White Impact updates.</p>
          <p><a href="${confirmUrl}">Confirm subscription</a></p>
          <p style="font-size:12px;color:#666">Unsubscribe anytime: <a href="${unsubscribeUrl}">Manage subscription</a></p>
        </div>
      `,
    }).catch(console.error);

    await logAudit({
      action: "newsletter.subscribe",
      entityType: "newsletter_subs",
      entityId: email,
      summary: `Newsletter subscription requested for ${email}`,
      metadata: { sourcePage },
      req,
    });

    res.status(201).json({
      success: true,
      message: "Subscription received. Check your inbox to confirm.",
    });
  } catch (err) {
    console.error("Newsletter error:", err);
    res
      .status(500)
      .json({ success: false, message: "Subscription failed. Please try again." });
  }
});

router.post("/confirm", async (req, res) => {
  const token = String(req.body.token || req.query.token || "").trim();
  if (!token) {
    return res
      .status(400)
      .json({ success: false, message: "Confirmation token is required." });
  }

  try {
    const tokenHash = sha256(token);
    const { rows } = await query(
      `SELECT * FROM newsletter_subs WHERE confirmation_token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Confirmation token not found." });
    }

    const subscriber = rows[0];
    await query(
      `UPDATE newsletter_subs
       SET is_active = TRUE,
           status = 'confirmed',
           confirmed_at = NOW(),
           confirmation_token_hash = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [subscriber.id],
    );

    await logAudit({
      action: "newsletter.confirm",
      entityType: "newsletter_subs",
      entityId: subscriber.email,
      summary: `Newsletter confirmed for ${subscriber.email}`,
      req,
    });

    res.json({ success: true, message: "Subscription confirmed." });
  } catch (error) {
    console.error("Newsletter confirm error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to confirm subscription." });
  }
});

router.post("/unsubscribe", async (req, res) => {
  const token = String(req.body.token || req.query.token || "").trim();
  const email = normalizeEmail(req.body.email || req.query.email);

  if (!token && !email) {
    return res
      .status(400)
      .json({ success: false, message: "Unsubscribe token or email is required." });
  }

  try {
    const whereClause = token
      ? "unsubscribe_token_hash = $1"
      : "email = $1";
    const value = token ? sha256(token) : email;
    const { rows } = await query(
      `SELECT * FROM newsletter_subs WHERE ${whereClause} LIMIT 1`,
      [value],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Newsletter subscription not found." });
    }

    const subscriber = rows[0];
    await query(
      `UPDATE newsletter_subs
       SET is_active = FALSE,
           status = 'unsubscribed',
           unsubscribed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [subscriber.id],
    );

    await logAudit({
      action: "newsletter.unsubscribe",
      entityType: "newsletter_subs",
      entityId: subscriber.email,
      summary: `Newsletter unsubscribed for ${subscriber.email}`,
      req,
    });

    res.json({ success: true, message: "You have been unsubscribed." });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to unsubscribe." });
  }
});

router.get("/admin", requireNewsletterAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, source_page, status, is_active, subscribed_at, confirmation_sent_at, confirmed_at, unsubscribed_at, updated_at, created_at
       FROM newsletter_subs
       ORDER BY subscribed_at DESC`,
    );
    res.json({ success: true, data: rows.map(formatNewsletter) });
  } catch (error) {
    console.error("Newsletter admin list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load newsletter subscriptions." });
  }
});

router.get("/", requireNewsletterAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, source_page, status, is_active, subscribed_at, confirmation_sent_at, confirmed_at, unsubscribed_at, updated_at, created_at
       FROM newsletter_subs
       ORDER BY subscribed_at DESC`,
    );
    res.json({ success: true, data: rows.map(formatNewsletter) });
  } catch (error) {
    console.error("Newsletter list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load newsletter subscriptions." });
  }
});

router.put("/admin/:id", requireNewsletterAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid newsletter id is required." });
  }

  try {
    const existing = await query(
      "SELECT * FROM newsletter_subs WHERE id = $1 LIMIT 1",
      [id],
    );
    if (!existing.rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Newsletter subscription not found." });
    }

    const row = existing.rows[0];
    const nextStatus = String(req.body.status || row.status || "pending").trim();
    const isActive = nextStatus === "confirmed" || nextStatus === "active";

    const { rows } = await query(
      `UPDATE newsletter_subs
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           source_page = COALESCE($3, source_page),
           status = $4,
           is_active = $5,
           confirmed_at = CASE WHEN $4 = 'confirmed' AND confirmed_at IS NULL THEN NOW() ELSE confirmed_at END,
           unsubscribed_at = CASE WHEN $4 = 'unsubscribed' THEN NOW() ELSE unsubscribed_at END,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        req.body.fullName ? String(req.body.fullName).trim() : null,
        req.body.email ? normalizeEmail(req.body.email) : null,
        req.body.sourcePage ? String(req.body.sourcePage).trim() : null,
        nextStatus,
        isActive,
        id,
      ],
    );

    await logAudit({
      actor: req.user,
      action: "newsletter.update",
      entityType: "newsletter_subs",
      entityId: id,
      summary: `Newsletter subscription ${id} updated`,
      metadata: { status: nextStatus },
      req,
    });

    res.json({ success: true, data: formatNewsletter(rows[0]) });
  } catch (error) {
    console.error("Newsletter update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update newsletter subscription." });
  }
});

module.exports = router;
