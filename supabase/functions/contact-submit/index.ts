import { audit, cleanString, getServiceClient, json, parseBody, rateLimit, sendEmail, validateEmail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "contact-submit", 10, 60 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many submissions. Please try again in an hour." });
  }

  const body = await parseBody(req);
  const fullName = cleanString(body.fullName ?? body.full_name, 160);
  const email = cleanString(String(body.email || "").toLowerCase(), 255);
  const subject = cleanString(body.subject, 255);
  const message = cleanString(body.message, 5000);
  const category = cleanString(body.category, 80, "general") || "general";
  const sourcePage = cleanString(body.sourcePage ?? body.source_page, 160, "work-with-us") || "work-with-us";

  const errors = [];
  if (fullName.length < 2) errors.push("Full name is required (minimum 2 characters)");
  if (!validateEmail(email)) errors.push("Valid email address is required");
  if (subject.length < 5) errors.push("Subject is required (minimum 5 characters)");
  if (message.length < 10) errors.push("Message is required (minimum 10 characters)");
  if (errors.length) return json(req, 400, { success: false, errors });

  try {
    const client = getServiceClient();
    const { data, error } = await client
      .from("contact_submissions")
      .insert({ full_name: fullName, email, subject, message, category, source_page: sourcePage, status: "pending" })
      .select("id, created_at")
      .single();
    if (error) throw error;

    await Promise.allSettled([
      sendEmail({
        to: email,
        subject: "We received your message - White Impact Development Initiative",
        html: `<p>Dear ${fullName},</p><p>Thank you for reaching out. We received your message and our team will respond within 2 business days.</p>`,
      }),
      sendEmail({
        to: Deno.env.get("STAFF_EMAIL") || "info@whiteimpactinitiative.org",
        subject: `New contact: ${subject || "General Inquiry"}`,
        html: `<p><strong>Name:</strong> ${fullName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Subject:</strong> ${subject}</p><p>${message}</p>`,
      }),
      audit(req, client, {
        action: "contact.create",
        entityType: "contact_submissions",
        entityId: data.id,
        summary: `Contact submission received from ${fullName}`,
        metadata: { category, sourcePage },
      }),
    ]);

    return json(req, 201, {
      success: true,
      message: "Message received! We'll get back to you within 2 business days.",
      id: data.id,
    });
  } catch {
    return json(req, 500, { success: false, message: "Failed to save your message. Please try again." });
  }
});
