/**
 * POST /api/contact
 * Saves a contact/Work-With-Us submission and optionally sends an email.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { validateContactForm } = require("../middleware/validators");


// health check 
router.get("/health", (_req, res) => {
  res.json({ success: true, service: "contact", status: "ok" });
});

router.post("/", async (req, res) => {
  const { fullName, email, subject, message } = req.body;

  const validation = validateContactForm({ fullName, email, subject, message });
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  try {
    const result = await query(
      `INSERT INTO contact_submissions (full_name, email, subject, message)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [fullName.trim(), email.toLowerCase().trim(), subject, message.trim()]
    );

    const submission = result.rows[0];

    // Send confirmation email to submitter (non-blocking)
    sendEmail({
      to: email,
      subject: "We received your message — White Impact Development Initiative",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <div style="background:#0c1f2e;padding:24px 32px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0;font-size:20px">White Impact Development Initiative</h2>
          </div>
          <div style="background:#f9f9fb;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p>Dear ${fullName},</p>
            <p>Thank you for reaching out! We received your message and our team will respond within <strong>2 business days</strong>.</p>
            <p><strong>Your message:</strong><br><em>${message}</em></p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:13px;color:#6b7280">White Impact Development Initiative<br>No F5, Abubakar Plaza, Millennium City 800104, Kaduna, Nigeria<br>+234 814 660 0001 · info@whiteimpactinitiative.org</p>
          </div>
        </div>
      `,
    }).catch(console.error);

    // Notify staff (non-blocking)
    sendEmail({
      to: process.env.STAFF_EMAIL || "info@whiteimpactinitiative.org",
      subject: `New contact: ${subject || "General Inquiry"} — from ${fullName}`,
      html: `
        <p><strong>Name:</strong> ${fullName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject || "—"}</p>
        <p><strong>Message:</strong><br>${message}</p>
        <p style="font-size:12px;color:#999">Submission ID: ${submission.id} · ${submission.created_at}</p>
      `,
    }).catch(console.error);

    res.status(201).json({
      success: true,
      message: "Message received! We'll get back to you within 2 business days.",
      id: submission.id,
    });
  } catch (err) {
    console.error("Contact submission error:", err);
    res.status(500).json({ success: false, message: "Failed to save your message. Please try again." });
  }
});

/* GET /api/contact — list all submissions (admin use, protect with auth in production) */
router.get("/", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, subject, status, created_at
       FROM contact_submissions ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch submissions." });
  }
});

module.exports = router;
