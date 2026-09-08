/**
 * Donation support with bank transfer receipts and online payment tracking.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { validateDonationForm } = require("../middleware/validators");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../middleware/audit");

function getBankDetails() {
  return {
    bankName: String(process.env.DONATION_BANK_NAME || "").trim(),
    accountNumber: String(process.env.DONATION_ACCOUNT_NUMBER || "").trim(),
    accountName: String(process.env.DONATION_ACCOUNT_NAME || "").trim(),
  };
}

function bankDetailsConfigured(bank = getBankDetails()) {
  return Boolean(bank.bankName && bank.accountNumber && bank.accountName);
}

const receiptsDir = path.join(__dirname, "../uploads/receipts");
if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error("Receipt cleanup error:", error.message);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeReference(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDonation(row) {
  return {
    id: row.id,
    reference: row.reference,
    fullName: row.full_name || "",
    email: row.email || "",
    phone: row.phone || "",
    amountKobo: Number(row.amount_kobo || 0),
    amountNaira: Number(row.amount_naira || 0),
    programArea: row.program_area || "",
    message: row.message || "",
    status: row.status || "pending",
    paymentProvider: row.payment_provider || "bank_transfer",
    paymentReference: row.payment_reference || "",
    paymentStatus: row.payment_status || row.status || "pending",
    receiptUrl: row.receipt_url || "",
    paystackData: row.paystack_data || null,
    providerPayload: row.provider_payload || null,
    confirmationMethod: row.confirmation_method || "",
    verifiedAt: row.verified_at || null,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function donationPayload(body, existing = {}) {
  const amount = Number(body.amount ?? body.amountNaira ?? existing.amount_naira ?? 0);
  const amountNaira = Number.isFinite(amount) ? amount : 0;
  const amountKobo = Math.round(amountNaira * 100);
  return {
    fullName: String(body.fullName || body.full_name || existing.full_name || "").trim(),
    email: normalizeEmail(body.email || existing.email),
    phone: String(body.phone || existing.phone || "").trim(),
    amountKobo,
    amountNaira,
    category: String(body.category || body.programArea || existing.program_area || "").trim(),
    message: String(body.message || existing.message || "").trim(),
    idempotencyKey: String(body.idempotencyKey || body.idempotency_key || existing.idempotency_key || "").trim(),
    paymentProvider: String(body.paymentProvider || body.payment_provider || existing.payment_provider || "bank_transfer").trim(),
    paymentReference: String(body.paymentReference || body.payment_reference || existing.payment_reference || "").trim(),
    paymentStatus: String(body.paymentStatus || body.payment_status || existing.payment_status || "pending").trim(),
  };
}

function createReceiptUpload() {
  const receiptStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, receiptsDir),
    filename: (req, file, cb) => {
      const ref = normalizeReference(req.body.reference || "receipt") || "receipt";
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${ref}-${Date.now()}${ext}`);
    },
  });

  return multer({
    storage: receiptStorage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  });
}

const receiptUpload = createReceiptUpload();

router.get("/health", (_req, res) => {
  res.json({ success: true, service: "donate", status: "ok" });
});

router.post("/initiate", async (req, res) => {
  const bank = getBankDetails();
  if (!bankDetailsConfigured(bank)) {
    return res.status(503).json({
      success: false,
      message: "Bank transfer details are not configured. Please contact the administrator.",
    });
  }

  const payload = donationPayload(req.body);
  const validation = validateDonationForm({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    amount: payload.amountNaira,
    category: payload.category,
    message: payload.message,
  });
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const reference = `WII-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  try {
    const { rows } = await query(
      `INSERT INTO donations (
        reference, full_name, email, phone, amount_kobo, amount_naira, program_area,
        message, status, payment_provider, payment_status, idempotency_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending','bank_transfer','pending',$9)
      RETURNING *`,
      [
        reference,
        payload.fullName,
        payload.email,
        payload.phone || null,
        payload.amountKobo,
        Math.round(payload.amountNaira),
        payload.category,
        payload.message || null,
        payload.idempotencyKey || null,
      ],
    );

    await logAudit({
      action: "donation.initiate",
      entityType: "donations",
      entityId: reference,
      summary: `Bank transfer donation initiated for ${payload.fullName}`,
      metadata: { programArea: payload.category, amount: payload.amountNaira },
      req,
    });

    res.json({
      success: true,
      reference,
      donation: {
        fullName: payload.fullName,
        email: payload.email,
        amountNaira: payload.amountNaira,
        programArea: payload.category,
      },
      bank,
      donationId: rows[0].id,
      confirmationEmail: process.env.STAFF_EMAIL || "info@whiteimpactinitiative.org",
    });
  } catch (err) {
    console.error("Donation initiation error:", err);
    res
      .status(500)
      .json({ success: false, message: "Could not record your donation. Please try again." });
  }
});

router.post("/receipt", receiptUpload.single("receipt"), async (req, res) => {
  const reference = normalizeReference(req.body.reference);

  if (!reference) {
    if (req.file) safeUnlink(req.file.path);
    return res
      .status(400)
      .json({ success: false, message: "Donation reference is required." });
  }

  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "Please upload your payment receipt." });
  }

  const receiptUrl = `/uploads/receipts/${req.file.filename}`;

  try {
    const { rows } = await query(
      `SELECT * FROM donations WHERE reference = $1 LIMIT 1`,
      [reference],
    );
    if (!rows.length) {
      safeUnlink(req.file.path);
      return res
        .status(404)
        .json({ success: false, message: "Donation reference not found." });
    }

    const donation = rows[0];

    await query(
      `UPDATE donations
       SET status='receipt_submitted',
           payment_status='receipt_submitted',
           receipt_url=$2,
           confirmation_method='receipt',
           updated_at = NOW()
       WHERE reference=$1`,
      [reference, receiptUrl],
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
          <p><strong>Amount:</strong> ₦${Number(donation.amount_naira || 0).toLocaleString()}</p>
          <p><strong>Program:</strong> ${donation.program_area || "General"}</p>
          <p><strong>Receipt File:</strong> <a href="${receiptFullUrl}" target="_blank">View Uploaded Receipt</a></p>
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
          <p>Our team will verify your transfer and confirm your donation shortly.</p>
        </div>
      `,
    }).catch(console.error);

    await logAudit({
      action: "donation.receipt",
      entityType: "donations",
      entityId: reference,
      summary: `Receipt uploaded for donation ${reference}`,
      req,
    });

    res.json({
      success: true,
      message: "Receipt submitted successfully. We will confirm your donation shortly.",
      reference,
      receipt_url: receiptUrl,
      receipt_full_url: receiptFullUrl,
    });
  } catch (err) {
    console.error("Receipt upload error:", err);
    if (req.file) safeUnlink(req.file.path);
    res
      .status(500)
      .json({ success: false, message: "Receipt upload failed. Please try again." });
  }
});

router.get("/admin", requireAuth, requireRole("super_admin", "admin", "finance_manager"), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, reference, full_name, email, phone, amount_kobo, amount_naira, program_area, message,
              status, payment_provider, payment_reference, payment_status, receipt_url, paystack_data,
              provider_payload, confirmation_method, verified_at, paid_at, created_at, updated_at
       FROM donations
       ORDER BY created_at DESC
       LIMIT 300`,
    );
    res.json({ success: true, data: rows.map(formatDonation) });
  } catch (err) {
    console.error("Donation admin list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch donations." });
  }
});

router.get("/list", requireAuth, requireRole("super_admin", "admin", "finance_manager"), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, reference, full_name, email, phone, amount_kobo, amount_naira, program_area, message,
              status, payment_provider, payment_reference, payment_status, receipt_url, paystack_data,
              provider_payload, confirmation_method, verified_at, paid_at, created_at, updated_at
       FROM donations
       ORDER BY created_at DESC
       LIMIT 300`,
    );
    res.json({ success: true, data: rows.map(formatDonation) });
  } catch (err) {
    console.error("Donation list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch donations." });
  }
});

router.put("/admin/:id", requireAuth, requireRole("super_admin", "admin", "finance_manager"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid donation id is required." });
  }

  try {
    const existing = await query("SELECT * FROM donations WHERE id = $1 LIMIT 1", [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: "Donation not found." });
    }

    const row = existing.rows[0];
    const nextStatus = String(req.body.status || row.status || "pending").trim();
    const nextPaymentStatus = String(req.body.paymentStatus || row.payment_status || nextStatus).trim();
    const wasApproved = row.status === "verified" || row.payment_status === "succeeded";
    const isApproved = nextStatus === "verified" || nextPaymentStatus === "succeeded";
    const confirmationMethod = req.body.confirmationMethod || (isApproved ? "admin_approved" : null);
    const approvalMessage = String(req.body.approvalMessage || "")
      .trim()
      .slice(0, 2000);
    const { rows } = await query(
      `UPDATE donations
       SET status = $1::varchar,
           payment_status = $2::varchar,
           confirmation_method = COALESCE($3, confirmation_method),
           verified_at = CASE WHEN $2::varchar = 'succeeded' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           paid_at = CASE WHEN $2::varchar = 'succeeded' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           verified_by = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        nextStatus,
        nextPaymentStatus,
        confirmationMethod,
        req.user.id,
        id,
      ],
    );

    await logAudit({
      actor: req.user,
      action: "donation.update",
      entityType: "donations",
      entityId: id,
      summary: `Donation ${id} updated`,
      metadata: { status: nextStatus, paymentStatus: nextPaymentStatus },
      req,
    });

    let emailSent = null;
    if (isApproved && !wasApproved) {
      const approvedDonation = rows[0];
      const donorName = escapeHtml(approvedDonation.full_name || "there");
      const reference = escapeHtml(approvedDonation.reference);
      const amount = Number(approvedDonation.amount_naira || 0).toLocaleString();
      const appreciationMessage = approvalMessage ||
        "Thank you for supporting our work and helping us create lasting impact in our communities.";
      const emailResult = await sendEmail({
        to: approvedDonation.email,
        subject: `Donation approved — ${approvedDonation.reference}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#001a4d">
            <h2>Thank you, ${donorName}</h2>
            <p>We have received and approved your donation to White Impact Development Initiative.</p>
            <p><strong>Reference:</strong> ${reference}</p>
            <p><strong>Amount:</strong> ₦${amount}</p>
            <p>${escapeHtml(appreciationMessage).replaceAll("\n", "<br>")}</p>
            <p>With appreciation,<br>White Impact Development Initiative</p>
          </div>
        `,
        text: `Thank you, ${approvedDonation.full_name || "there"}. Your donation (${approvedDonation.reference}) of ₦${amount} has been received and approved by White Impact Development Initiative.\n\n${appreciationMessage}`,
      });
      emailSent = emailResult.success === true;
    }

    res.json({
      success: true,
      data: formatDonation(rows[0]),
      emailSent,
      message:
        emailSent === false
          ? "Donation approved, but the donor email could not be sent."
          : isApproved && !wasApproved
            ? "Donation approved and donor notified."
            : "Donation updated successfully.",
    });
  } catch (error) {
    console.error("Donation update error:", error);
    res.status(500).json({ success: false, message: "Failed to update donation." });
  }
});

module.exports = router;
