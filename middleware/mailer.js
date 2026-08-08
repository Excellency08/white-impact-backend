const { Resend } = require("resend");

// Initialize Resend client lazily when needed
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Verifies email API status for system diagnostics.
 */
async function testTransporter() {
  const apiKey = process.env.RESEND_API_KEY;
  const isMock = process.env.MOCK_EMAIL === "true" || process.env.SEND_EMAILS === "false";

  if (isMock) {
    console.log("⚠️  [Email] Running in mock mode (MOCK_EMAIL=true or SEND_EMAILS=false).");
    return { ok: true, mode: "mock" };
  }

  if (!apiKey) {
    console.log("⚠️  [Email] Missing RESEND_API_KEY. Falling back to mock mode.");
    return { ok: true, mode: "mock", error: "Missing RESEND_API_KEY" };
  }

  console.log("✅ Resend API key detected and configured.");
  return { ok: true, mode: "real" };
}

/**
 * Sends an email using Resend API (HTTP 443).
 */
async function sendEmail({ to, subject, html, text }) {
  const isMock = process.env.MOCK_EMAIL === "true" || process.env.SEND_EMAILS === "false";
  const resend = getResendClient();

  if (isMock || !resend) {
    console.log(`⚠️  [Email Mock] To: ${to} | Subject: "${subject}"`);
    return { success: true, messageId: "mock-" + Date.now() };
  }

  try {
    // Resend default onboarding sender or your verified domain sender
    const fromAddress = process.env.EMAIL_FROM 
      || process.env.FROM_EMAIL 
      || "White Impact Initiative <onboarding@resend.dev>";

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error(`❌ Email send error (${to}):`, error.message);
      return { success: false, error: error.message };
    }

    console.log(`✅ Email successfully sent to ${to}: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error(`❌ Email execution failed (${to}):`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  testTransporter,
  sendEmail,
};