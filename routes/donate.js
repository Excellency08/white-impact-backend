/**
 * POST /api/donate/initiate  — Record donation & return bank transfer details
 * POST /api/donate/receipt   — Upload payment receipt for confirmation
 * GET  /api/donate/list      — List donations (admin)
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { validateDonationForm } = require("../middleware/validators");


// health check 
router.get("/health", (_req, res) => {
  res.json({ success: true, service: "donate", status: "ok" });
});
const BANK_DETAILS = {
  bankName: process.env.DONATION_BANK_NAME || "Access Bank",
  accountNumber: process.env.DONATION_ACCOUNT_NUMBER || "0123456789",
  accountName: process.env.DONATION_ACCOUNT_NAME || "White Impact Development Initiative",
};

const receiptsDir = path.join(__dirname, "../uploads/receipts");
if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, receiptsDir),
  filename: (req, file, cb) => {
    const ref = (req.body.reference || "receipt").replace(/[^a-zA-Z0-9-]/g, "");
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${ref}-${Date.now()}${ext}`);
  },
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

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
    await query(
      `INSERT INTO donations (reference, full_name, email, phone, amount_kobo, program_area, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id, amount_naira`,
      [reference, fullName.trim(), email.toLowerCase().trim(), phone, amountKobo, category, message || null]
    );

    res.json({
      success: true,
      reference,
      donation: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        amountNaira,
        programArea: category,
      },
      bank: BANK_DETAILS,
      confirmationEmail: process.env.STAFF_EMAIL || "info@whiteimpactinitiative.org",
    });
  } catch (err) {
    console.error("Donation initiation error:", err);
    res.status(500).json({ success: false, message: "Could not record your donation. Please try again." });
  }
});

/* ─── POST /api/donate/receipt ──────────────────────────────────── */
router.post("/receipt", receiptUpload.single("receipt"), async (req, res) => {
  const { reference } = req.body;

  if (!reference) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: "Donation reference is required." });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: "Please upload your payment receipt." });
  }

  const receiptUrl = `/uploads/receipts/${req.file.filename}`;

  try {
    const { rows } = await query(`SELECT * FROM donations WHERE reference = $1`, [reference]);
    if (!rows.length) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: "Donation reference not found." });
    }

    const donation = rows[0];

    await query(
      `UPDATE donations SET status='receipt_submitted', receipt_url=$2 WHERE reference=$1`,
      [reference, receiptUrl]
    );

    const staffEmail = process.env.STAFF_EMAIL || "info@whiteimpactinitiative.org";
    const receiptFullUrl = `${process.env.BACKEND_URL || "http://localhost:3030"}${receiptUrl}`;
    sendEmail({
      to: staffEmail,
      subject: `Donation receipt submitted — ${reference}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <h3>New donation receipt to review</h3>
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Donor:</strong> ${donation.full_name} (${donation.email})</p>
          <p><strong>Amount:</strong> ₦${Number(donation.amount_naira).toLocaleString()}</p>
          <p><strong>Program:</strong> ${donation.program_area || "General"}</p>
          <p><strong>Receipt File:</strong> <a href="${receiptFullUrl}" target="_blank">View Uploaded Receipt</a></p>
          <p>Receipt uploaded and awaiting confirmation.</p>
        </div>
      `,
    }).catch(console.error);

    sendEmail({
      to: donation.email,
      subject: "Receipt received — White Impact Development Initiative",
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
          <h3>Thank you, ${donation.full_name}!</h3>
          <p>We have received your payment receipt for donation reference <strong>${reference}</strong>.</p>
          <p>Our team will verify your transfer and confirm your donation shortly. You will receive a confirmation email once verified.</p>
        </div>
      `,
    }).catch(console.error);

    res.json({
      success: true,
      message: "Receipt submitted successfully. We will confirm your donation shortly.",
      reference,
      receipt_url: receiptUrl,
      receipt_full_url: receiptFullUrl,
    });
  } catch (err) {
    console.error("Receipt upload error:", err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: "Receipt upload failed. Please try again." });
  }
});

/* ─── GET /api/donate/list ──────────────────────────────────────── */
router.get("/list", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, reference, full_name, email, amount_naira, program_area, status, receipt_url, created_at
       FROM donations ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch donations." });
  }
});

module.exports = router;