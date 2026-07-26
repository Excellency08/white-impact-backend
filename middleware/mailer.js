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

  // Priority: SMTP_HOST if provided
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback: Gmail service environment variables
  if (process.env.EMAIL_SERVICE === "gmail" && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  // Fallback: Mock transporter (console logging)
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
  });
}

async function testTransporter() {
  try {
    transporter = getTransporter();

    if (process.env.MOCK_EMAIL === "true" || process.env.SEND_EMAILS === "false") {
      console.log("⚠️  [Email] Mock mode: Emails logged to console (MOCK_EMAIL=true or SEND_EMAILS=false)");
      return { ok: true, mode: "mock" };
    }

    if (!process.env.SMTP_HOST && !process.env.GMAIL_USER && !process.env.SMTP_USER) {
      console.log("⚠️  [Email] Mock mode: Emails logged to console (configure SMTP_HOST or Gmail credentials for production)");
      return { ok: true, mode: "mock" };
    }

    await transporter.verify();
    console.log("✅ Email transporter verified and ready.");
    return { ok: true, mode: "real" };
  } catch (error) {
    const fallbackMessage = `⚠️  [Email] Transporter could not verify: ${error.message}. Falling back to mock mode.`;
    console.warn(fallbackMessage);
    transporter = nodemailer.createTransport({ streamTransport: true, newline: "unix" });
    return { ok: true, mode: "mock", error: error.message };
  }
}

async function sendEmail({ to, subject, html, text }) {
  try {
    if (!transporter) {
      transporter = getTransporter();
    }

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.FROM_EMAIL || `"White Impact Initiative" <${process.env.EMAIL_USER || "noreply@whiteimpactinitiative.org"}>`,
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
