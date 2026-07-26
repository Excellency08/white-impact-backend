/**
 * POST /api/newsletter      — Subscribe an email
 * DELETE /api/newsletter    — Unsubscribe
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { validateNewsletterForm } = require("../middleware/validators");

router.post("/", async (req, res) => {
  const { email } = req.body;
  const validation = validateNewsletterForm({ email });

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.errors[0] || "Please provide a valid email address." });
  }

  try {
    await query(
      `INSERT INTO newsletter_subs (email)
       VALUES ($1)
       ON CONFLICT (email)
       DO UPDATE SET is_active = TRUE`,
      [email.toLowerCase().trim()]
    );

    // Welcome email (non-blocking)
    sendEmail({
      to: email,
      subject: "Welcome to the White Impact Newsletter!",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <div style="background:#0c1f2e;padding:24px 32px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0;font-size:20px">White Impact Development Initiative</h2>
          </div>
          <div style="background:#f9f9fb;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <h3 style="color:#0c1f2e">You're subscribed! 🎉</h3>
            <p>Thank you for joining our community. You'll receive updates on our programs, impact stories, and events across Nigeria.</p>
            <a href="${process.env.SITE_URL || "https://whiteimpactinitiative.org"}" 
               style="display:inline-block;margin-top:16px;padding:12px 24px;background:#e85d04;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              Visit Our Website
            </a>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:12px;color:#6b7280">
              To unsubscribe, reply to this email with "Unsubscribe" in the subject line.
            </p>
          </div>
        </div>
      `,
    }).catch(console.error);

    res.status(201).json({ success: true, message: "Successfully subscribed! Check your inbox." });
  } catch (err) {
    console.error("Newsletter error:", err);
    res.status(500).json({ success: false, message: "Subscription failed. Please try again." });
  }
});

router.delete("/", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email required." });

  try {
    await query(`UPDATE newsletter_subs SET is_active = FALSE WHERE email = $1`, [email.toLowerCase()]);
    res.json({ success: true, message: "You have been unsubscribed." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to unsubscribe." });
  }
});

module.exports = router;
