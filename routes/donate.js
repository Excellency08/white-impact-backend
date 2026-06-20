/**
 * POST /api/donate/initiate  — Create Paystack payment session
 * GET  /api/donate/verify    — Verify payment after redirect
 * GET  /api/donate/list      — List donations (admin)
 *
 * Paystack flow:
 *   1. Frontend POSTs donor details → backend calls Paystack initialize API
 *   2. Backend returns { authorization_url } → frontend redirects user
 *   3. Paystack redirects to CALLBACK_URL with ?reference=xxx
 *   4. GET /api/donate/verify?reference=xxx → backend verifies with Paystack
 */

const express = require("express");
const router = express.Router();
const https = require("https");
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { validateDonationForm } = require("../middleware/validators");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || "http://localhost:3000/api/donate/verify";

/* ─── Paystack API helper ───────────────────────────────────────── */
function paystackRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid Paystack response"));
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/* ─── POST /api/donate/initiate ─────────────────────────────────── */
router.post("/initiate", async (req, res) => {
  const { fullName, email, phone, amount, category, message } = req.body;

  const validation = validateDonationForm({ fullName, email, phone, amount, category, message });
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const amountNaira = parseFloat(amount);

  const amountKobo = Math.round(amountNaira * 100);
  const reference = `WII-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  try {
    // Save pending donation to DB
    const result = await query(
      `INSERT INTO donations (reference, full_name, email, phone, amount_kobo, amount_naira, program_area, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id`,
      [reference, fullName.trim(), email.toLowerCase().trim(), phone, amountKobo, amountNaira, category, message || null]
    );

    if (!PAYSTACK_SECRET || PAYSTACK_SECRET.startsWith("PASTE_")) {
      // ── Demo mode (no real Paystack key) ──
      return res.json({
        success: true,
        demo: true,
        reference,
        message: "Demo mode: Paystack key not configured. Donation recorded as pending.",
        authorization_url: `${req.headers.origin || ""}/donate.html?demo=1&reference=${reference}`,
      });
    }

    // ── Live Paystack call ──
    const paystack = await paystackRequest("POST", "/transaction/initialize", {
      email: email.toLowerCase().trim(),
      amount: amountKobo,
      reference,
      callback_url: CALLBACK_URL,
      metadata: {
        full_name: fullName,
        phone,
        program_area: category,
        custom_fields: [
          { display_name: "Donor Name", variable_name: "donor_name", value: fullName },
          { display_name: "Program Area", variable_name: "program_area", value: category },
        ],
      },
    });

    if (!paystack.status) {
      throw new Error(paystack.message || "Paystack initialization failed");
    }

    res.json({
      success: true,
      authorization_url: paystack.data.authorization_url,
      reference,
    });
  } catch (err) {
    console.error("Donation initiation error:", err);
    res.status(500).json({ success: false, message: "Payment initialization failed. Please try again." });
  }
});

/* ─── GET /api/donate/verify ────────────────────────────────────── */
router.get("/verify", async (req, res) => {
  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ success: false, message: "Reference is required." });
  }

  try {
    // Check DB first
    const { rows } = await query(`SELECT * FROM donations WHERE reference = $1`, [reference]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Donation reference not found." });
    }

    const donation = rows[0];

    if (donation.status === "success") {
      return res.json({ success: true, already_verified: true, donation: safeRow(donation) });
    }

    if (!PAYSTACK_SECRET || PAYSTACK_SECRET.startsWith("PASTE_")) {
      // Demo mode — mark as success
      await query(
        `UPDATE donations SET status='success', verified_at=NOW() WHERE reference=$1`,
        [reference]
      );
      return res.json({ success: true, demo: true, donation: safeRow(donation) });
    }

    const paystack = await paystackRequest("GET", `/transaction/verify/${reference}`, null);

    if (!paystack.status || paystack.data.status !== "success") {
      await query(`UPDATE donations SET status='failed', paystack_data=$2 WHERE reference=$1`, [
        reference, paystack.data,
      ]);
      return res.status(402).json({ success: false, message: "Payment was not successful." });
    }

    // Update DB
    await query(
      `UPDATE donations SET status='success', paystack_data=$2, verified_at=NOW() WHERE reference=$1`,
      [reference, paystack.data]
    );

    // Thank-you email
    const row = paystack.data;
    sendEmail({
      to: donation.email,
      subject: "Thank you for your donation — White Impact Development Initiative",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <div style="background:#0c1f2e;padding:24px 32px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">White Impact Development Initiative</h2>
          </div>
          <div style="background:#f9f9fb;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <h3>Thank you, ${donation.full_name}! 🙏</h3>
            <p>Your donation of <strong>₦${(donation.amount_kobo / 100).toLocaleString()}</strong> to the <strong>${donation.program_area || "General Fund"}</strong> has been received.</p>
            <p>Your generosity helps us empower underserved communities across Nigeria. We'll keep you updated on the impact of your contribution.</p>
            <div style="background:#e8f4fd;border-left:4px solid #0c1f2e;padding:12px 16px;margin:20px 0;border-radius:0 4px 4px 0">
              <p style="margin:0;font-size:13px"><strong>Reference:</strong> ${reference}</p>
            </div>
            <a href="${process.env.SITE_URL || "https://whiteimpactinitiative.org"}"
               style="display:inline-block;padding:12px 24px;background:#e85d04;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
              Learn About Our Programs
            </a>
          </div>
        </div>
      `,
    }).catch(console.error);

    res.json({ success: true, donation: safeRow({ ...donation, status: "success" }) });
  } catch (err) {
    console.error("Donation verification error:", err);
    res.status(500).json({ success: false, message: "Verification failed. Please contact us." });
  }
});

/* ─── GET /api/donate/list ──────────────────────────────────────── */
router.get("/list", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, reference, full_name, email, amount_naira, program_area, status, created_at
       FROM donations ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch donations." });
  }
});

function safeRow(row) {
  const { paystack_data, ...safe } = row;
  return safe;
}

module.exports = router;
