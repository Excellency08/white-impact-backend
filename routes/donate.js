/**
 * Donation support with bank transfer receipts and online payment tracking.
 */

const crypto = require("crypto");
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

const BANK_DETAILS = {
  bankName: process.env.DONATION_BANK_NAME || "Access Bank",
  accountNumber: process.env.DONATION_ACCOUNT_NUMBER || "0123456789",
  accountName:
    process.env.DONATION_ACCOUNT_NAME || "White Impact Development Initiative",
};

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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return Boolean(value);
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
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
      bank: BANK_DETAILS,
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

router.post("/payments/initialize", async (req, res) => {
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

  const idempotencyKey = payload.idempotencyKey || sha256(`${payload.email}:${payload.amountNaira}:${payload.category}:${payload.fullName}`);
  try {
    const existing = await query(
      `SELECT * FROM donations WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.rows.length) {
      return res.json({
        success: true,
        idempotent: true,
        data: formatDonation(existing.rows[0]),
      });
    }

    const reference = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const { rows } = await query(
      `INSERT INTO donations (
        reference, full_name, email, phone, amount_kobo, amount_naira, program_area,
        message, status, payment_provider, payment_status, idempotency_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'payment_pending','paystack','initialized',$9)
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
        idempotencyKey,
      ],
    );

    const donation = rows[0];
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    const baseUrl = process.env.SITE_URL || process.env.FRONTEND_URL || "https://whiteimpactinitiative.org";

    if (!secret || isTruthy(process.env.MOCK_PAYSTACK || "true")) {
      const authorizationUrl = `${baseUrl.replace(/\/$/, "")}/donate.html?reference=${encodeURIComponent(reference)}&mock=1`;
      await query(
        `UPDATE donations SET paystack_data = $2::jsonb, payment_reference = $3, updated_at = NOW() WHERE id = $1`,
        [
          donation.id,
          JSON.stringify({ authorization_url: authorizationUrl, access_code: reference, mock: true }),
          reference,
        ],
      );
      return res.json({
        success: true,
        data: formatDonation({ ...donation, payment_reference: reference, paystack_data: { authorization_url: authorizationUrl, mock: true } }),
        authorizationUrl,
        accessCode: reference,
        message: "Mock payment session created.",
      });
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        email: payload.email,
        amount: payload.amountKobo,
        reference,
        metadata: {
          donationId: donation.id,
          fullName: payload.fullName,
          programArea: payload.category,
          message: payload.message,
        },
        callback_url: `${baseUrl.replace(/\/$/, "")}/donate.html`,
      }),
    });
    const json = await response.json();

    await query(
      `UPDATE donations
       SET payment_reference = $2,
           paystack_data = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [donation.id, reference, JSON.stringify(json.data || {})],
    );

    res.json({
      success: true,
      data: formatDonation({ ...donation, payment_reference: reference, paystack_data: json.data || {} }),
      authorizationUrl: json.data?.authorization_url || "",
      accessCode: json.data?.access_code || "",
    });
  } catch (error) {
    console.error("Payment initialization error:", error);
    res.status(500).json({ success: false, message: "Failed to initialize payment." });
  }
});

router.post(
  "/webhook/paystack",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    const rawBody = req.body?.length ? req.body.toString("utf8") : "";
    const signature = req.get("x-paystack-signature") || "";
    const mockSignature = req.get("x-mock-signature") || "";
    const isMockAllowed = isTruthy(process.env.MOCK_PAYSTACK || "true");
    const computed = secret
      ? crypto.createHmac("sha512", secret).update(rawBody).digest("hex")
      : "";
    const signatureValid =
      (secret && signature && computed === signature) ||
      (isMockAllowed && mockSignature === "mock-paystack");

    let event;
    try {
      event = rawBody ? JSON.parse(rawBody) : req.body;
    } catch {
      return res.status(400).json({ success: false, message: "Invalid webhook payload." });
    }

    const providerEventId = String(event?.id || event?.event_id || event?.data?.id || "").trim() || crypto.randomUUID();
    const eventType = String(event?.event || event?.type || "webhook").trim();

    try {
      const stored = await query(
        `INSERT INTO donation_webhook_events (
          provider, event_id, event_type, payload, signature_valid, processed_at
        ) VALUES ($1,$2,$3,$4::jsonb,$5,NOW())
        ON CONFLICT (provider, event_id) DO NOTHING
        RETURNING id`,
        ["paystack", providerEventId, eventType, JSON.stringify(event || {}), signatureValid],
      );

      if (!stored.rows.length) {
        return res.json({ success: true, deduped: true });
      }

      if (!signatureValid) {
        return res.status(401).json({ success: false, message: "Invalid webhook signature." });
      }

      const reference =
        event?.data?.reference ||
        event?.data?.metadata?.reference ||
        event?.data?.metadata?.donationReference ||
        event?.reference ||
        "";

      if (reference) {
        const paymentStatus =
          eventType === "charge.success" || event?.data?.status === "success"
            ? "succeeded"
            : event?.data?.status || "processing";
        const isSucceeded = paymentStatus === "succeeded";
        await query(
          `UPDATE donations
           SET payment_status = $2,
               status = CASE WHEN $5::boolean THEN 'verified'::varchar ELSE status END,
               paystack_data = COALESCE(paystack_data, '{}'::jsonb) || $3::jsonb,
               provider_payload = $3::jsonb,
               provider_event_id = $4,
               webhook_verified_at = NOW(),
               paid_at = CASE WHEN $5::boolean THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
               verified_at = CASE WHEN $5::boolean THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
               updated_at = NOW()
           WHERE reference = $1`,
          [reference, paymentStatus, JSON.stringify(event || {}), providerEventId, isSucceeded],
        );
      }

      await logAudit({
        action: "donation.webhook",
        entityType: "donations",
        entityId: reference || providerEventId,
        summary: `Donation webhook processed for ${reference || providerEventId}`,
        metadata: { eventType, signatureValid },
        req,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Donation webhook error:", error);
      return res.status(500).json({ success: false, message: "Webhook processing failed." });
    }
  },
);

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
    const { rows } = await query(
      `UPDATE donations
       SET status = $1,
           payment_status = $2,
           confirmation_method = COALESCE($3, confirmation_method),
           verified_at = CASE WHEN $2 = 'succeeded' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           paid_at = CASE WHEN $2 = 'succeeded' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           verified_by = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        nextStatus,
        nextPaymentStatus,
        req.body.confirmationMethod || null,
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

    res.json({ success: true, data: formatDonation(rows[0]) });
  } catch (error) {
    console.error("Donation update error:", error);
    res.status(500).json({ success: false, message: "Failed to update donation." });
  }
});

module.exports = router;
