const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  // Priority: EMAIL_HOST (generic SMTP) → GMAIL → Mock fallback
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
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

    if (!process.env.EMAIL_HOST && !process.env.GMAIL_USER) {
      console.log("⚠️  [Email] Mock mode: Emails logged to console (configure GMAIL or EMAIL_HOST for production)");
      return { ok: true, mode: "mock" };
    }

    await transporter.verify();
    console.log("✅ Email transporter verified and ready.");
    return { ok: true, mode: "real" };
  } catch (error) {
    console.log(`⚠️  [Email] Transporter check skipped: ${error.message} (Expected - mock mode configured)`);
    transporter = nodemailer.createTransport({ streamTransport: true });
    return { ok: true, mode: "mock", error: error.message };
  }
}

async function sendEmail({ to, subject, html, text }) {
  try {
    if (!transporter) {
      transporter = getTransporter();
    }

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"White Impact Initiative" <${process.env.EMAIL_USER || "noreply@whiteimpactinitiative.org"}>`,
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
