/**
 * Contact and work-with-us submissions.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../middleware/audit");
const { validateContactForm } = require("../middleware/validators");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireContactAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    requireRole(...ADMIN_ROLES)(req, res, next),
  );
}

function normalizeValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function formatContact(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    subject: row.subject || "",
    message: row.message || "",
    category: row.category || "general",
    sourcePage: row.source_page || "work-with-us",
    status: row.status || "pending",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildContactPayload(body, existing = {}) {
  return {
    fullName: normalizeValue(body.fullName || body.full_name || existing.full_name),
    email: normalizeValue(body.email || existing.email).toLowerCase(),
    subject: normalizeValue(body.subject || existing.subject),
    message: normalizeValue(body.message || existing.message),
    category: normalizeValue(body.category || existing.category || "general") || "general",
    sourcePage: normalizeValue(body.sourcePage || body.source_page || existing.source_page || "work-with-us") || "work-with-us",
    status: normalizeValue(body.status || existing.status || "pending") || "pending",
    notes: normalizeValue(body.notes || existing.notes || ""),
  };
}

router.get("/health", (_req, res) => {
  res.json({ success: true, service: "contact", status: "ok" });
});

router.post("/", async (req, res) => {
  const payload = buildContactPayload(req.body);
  const validation = validateContactForm(payload);
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  try {
    const result = await query(
      `INSERT INTO contact_submissions (
        full_name, email, subject, message, category, source_page, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at`,
      [
        payload.fullName,
        payload.email,
        payload.subject,
        payload.message,
        payload.category,
        payload.sourcePage,
        payload.status,
      ],
    );

    const submission = result.rows[0];

    sendEmail({
      to: payload.email,
      subject: "We received your message — White Impact Development Initiative",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <h2>White Impact Development Initiative</h2>
          <p>Dear ${payload.fullName},</p>
          <p>Thank you for reaching out! We received your message and our team will respond within 2 business days.</p>
          <p><strong>Your message:</strong><br><em>${payload.message}</em></p>
        </div>
      `,
    }).catch(console.error);

    sendEmail({
      to: process.env.STAFF_EMAIL || "info@whiteimpactinitiative.org",
      subject: `New contact: ${payload.subject || "General Inquiry"} — from ${payload.fullName}`,
      html: `
        <p><strong>Name:</strong> ${payload.fullName}</p>
        <p><strong>Email:</strong> ${payload.email}</p>
        <p><strong>Subject:</strong> ${payload.subject || "—"}</p>
        <p><strong>Message:</strong><br>${payload.message}</p>
      `,
    }).catch(console.error);

    await logAudit({
      action: "contact.create",
      entityType: "contact_submissions",
      entityId: submission.id,
      summary: `Contact submission received from ${payload.fullName}`,
      metadata: { category: payload.category, sourcePage: payload.sourcePage },
      req,
    });

    res.status(201).json({
      success: true,
      message: "Message received! We'll get back to you within 2 business days.",
      id: submission.id,
    });
  } catch (err) {
    console.error("Contact submission error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to save your message. Please try again." });
  }
});

router.get("/admin", requireContactAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, subject, message, category, source_page, status, notes, created_at, updated_at
       FROM contact_submissions
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    res.json({ success: true, data: rows.map(formatContact) });
  } catch (err) {
    console.error("Contact admin list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch submissions." });
  }
});

router.get("/", requireContactAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, subject, message, category, source_page, status, notes, created_at, updated_at
       FROM contact_submissions
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    res.json({ success: true, data: rows.map(formatContact) });
  } catch (err) {
    console.error("Contact list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch submissions." });
  }
});

router.put("/admin/:id", requireContactAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid contact id is required." });
  }

  try {
    const existingResult = await query(
      "SELECT * FROM contact_submissions WHERE id = $1 LIMIT 1",
      [id],
    );
    if (!existingResult.rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Contact submission not found." });
    }

    const existing = existingResult.rows[0];
    const payload = buildContactPayload(req.body, existing);
    const validation = validateContactForm(payload);
    if (!validation.valid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const { rows } = await query(
      `UPDATE contact_submissions
       SET full_name = $1,
           email = $2,
           subject = $3,
           message = $4,
           category = $5,
           source_page = $6,
           status = $7,
           notes = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        payload.fullName,
        payload.email,
        payload.subject,
        payload.message,
        payload.category,
        payload.sourcePage,
        payload.status,
        payload.notes || null,
        id,
      ],
    );

    await logAudit({
      actor: req.user,
      action: "contact.update",
      entityType: "contact_submissions",
      entityId: id,
      summary: `Contact submission ${id} updated`,
      metadata: { status: payload.status },
      req,
    });

    res.json({ success: true, data: formatContact(rows[0]) });
  } catch (error) {
    console.error("Contact update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update contact submission." });
  }
});

router.delete("/admin/:id", requireContactAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid contact id is required." });
  }

  try {
    const existing = await query(
      "SELECT full_name FROM contact_submissions WHERE id = $1 LIMIT 1",
      [id],
    );
    if (!existing.rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Contact submission not found." });
    }

    await query("DELETE FROM contact_submissions WHERE id = $1", [id]);
    await logAudit({
      actor: req.user,
      action: "contact.delete",
      entityType: "contact_submissions",
      entityId: id,
      summary: `Contact submission ${id} deleted`,
      req,
    });

    res.json({ success: true, message: "Contact submission deleted." });
  } catch (error) {
    console.error("Contact delete error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete contact submission." });
  }
});

module.exports = router;
