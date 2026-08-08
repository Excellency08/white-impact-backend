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

  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASS;

  // Use SSL port 465 and force IPv4 (family: 4) to fix Render IPv6 unreachable routing errors
  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
      family: 4,
    });
  }

  // Fallback: Mock transporter
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
  });
}

async function testTransporter() {
  try {
    console.log("🔍 [Email Debug] Environment Check:", {
      MOCK_EMAIL: process.env.MOCK_EMAIL || "not set",
      SEND_EMAILS: process.env.SEND_EMAILS || "not set",
      EMAIL_SERVICE: process.env.EMAIL_SERVICE || "not set",
      GMAIL_USER: process.env.GMAIL_USER || process.env.SMTP_USER ? "EXISTS" : "MISSING",
      GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS ? "EXISTS" : "MISSING",
    });

    transporter = getTransporter();

    if (process.env.MOCK_EMAIL === "true" || process.env.SEND_EMAILS === "false") {
      console.log("⚠️  [Email] Mock mode: Emails logged to console.");
      return { ok: true, mode: "mock" };
    }

    const hasConfig = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER;
    if (!hasConfig) {
      console.log("⚠️  [Email] Mock mode: Missing email credentials.");
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

    const senderEmail = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER || "noreply@whiteimpactinitiative.org";
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