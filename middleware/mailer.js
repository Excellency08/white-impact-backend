const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  // Force mock mode when requested or email sending is disabled
  if (process.env.MOCK_EMAIL === "true" || process.env.SEND_EMAILS === "false") {
    return nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
    });
  }

  // Priority 1: Direct SMTP Configuration
  const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const smtpPort = process.env.SMTP_PORT || process.env.EMAIL_PORT || process.env.SMTP_POR;

  if (smtpHost && smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10) || 587,
      secure: process.env.SMTP_SECURE === "true" || parseInt(smtpPort, 10) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  // Priority 2: Gmail Service Configuration (case-insensitive check)
  const service = (process.env.EMAIL_SERVICE || "").toLowerCase();
  const gmailUser = process.env.GMAIL_USER || smtpUser;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || smtpPass;

  if ((service === "gmail" || service === "google") && gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });
  }

  // Fallback: Direct Gmail credentials check without explicit service key
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  // Default: Mock transporter (logs output)
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
  });
}

async function testTransporter() {
  try {
    // 🔍 Debug log to inspect environment variables on server start
    console.log("🔍 [Email Debug] Environment Check:", {
      MOCK_EMAIL: process.env.MOCK_EMAIL || "not set",
      SEND_EMAILS: process.env.SEND_EMAILS || "not set",
      EMAIL_SERVICE: process.env.EMAIL_SERVICE || "not set",
      SMTP_HOST: process.env.SMTP_HOST || process.env.EMAIL_HOST || "not set",
      SMTP_USER: process.env.SMTP_USER || process.env.EMAIL_USER ? "EXISTS" : "MISSING",
      SMTP_PASS: process.env.SMTP_PASS || process.env.EMAIL_PASS ? "EXISTS" : "MISSING",
      GMAIL_USER: process.env.GMAIL_USER ? "EXISTS" : "MISSING",
      GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD ? "EXISTS" : "MISSING",
    });

    transporter = getTransporter();

    if (process.env.MOCK_EMAIL === "true" || process.env.SEND_EMAILS === "false") {
      console.log("⚠️  [Email] Mock mode: Emails logged to console (MOCK_EMAIL=true or SEND_EMAILS=false)");
      return { ok: true, mode: "mock" };
    }

    const hasConfig =
      process.env.SMTP_HOST ||
      process.env.EMAIL_HOST ||
      process.env.GMAIL_USER ||
      process.env.SMTP_USER ||
      process.env.EMAIL_USER;

    if (!hasConfig) {
      console.log("⚠️  [Email] Mock mode: Missing email credentials on server.");
      return { ok: true, mode: "mock" };
    }

    await transporter.verify();
    console.log("✅ Email transporter verified and ready.");
    return { ok: true, mode: "real" };
  } catch (error) {
    console.warn(`⚠️  [Email] Transporter verification failed: ${error.message}`);
    transporter = nodemailer.createTransport({ streamTransport: true, newline: "unix" });
    return { ok: true, mode: "mock", error: error.message };
  }
}

async function sendEmail({ to, subject, html, text }) {
  try {
    if (!transporter) {
      transporter = getTransporter();
    }

    const senderEmail = process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER || "noreply@whiteimpactinitiative.org";
    const fromAddress = process.env.EMAIL_FROM || process.env.FROM_EMAIL || `"White Impact Initiative" <${senderEmail}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    });

    console.log(`✅ Email sent to ${to}: ${info.messageId || "mock-" + Date.now()}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email send failed (${to}):`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getTransporter,
  testTransporter,
  sendEmail,
};