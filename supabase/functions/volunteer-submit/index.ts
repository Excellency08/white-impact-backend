import { audit, cleanString, getServiceClient, json, normalizeEmail, parseBody, rateLimit, sendEmail, validateEmail, validatePhone } from "../_shared/common.ts";

function list(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "volunteer-submit", 100, 15 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many requests. Please try again later." });
  }

  const body = await parseBody(req);
  const fullName = cleanString(body.fullName ?? body.full_name, 160);
  const email = normalizeEmail(body.email);
  const phone = cleanString(body.phone, 80);
  const motivation = cleanString(body.motivation, 5000);
  const errors = [];
  if (fullName.length < 2) errors.push("Full name is required");
  if (!validateEmail(email)) errors.push("Valid email address is required");
  if (phone && !validatePhone(phone)) errors.push("Valid phone number is required");
  if (motivation && motivation.length < 20) errors.push("Motivation must be at least 20 characters");
  if (errors.length) return json(req, 400, { success: false, errors });

  const payload = {
    full_name: fullName,
    email,
    phone: phone || null,
    location: cleanString(body.location, 160) || null,
    availability: cleanString(body.availability, 160) || null,
    experience_level: cleanString(body.experienceLevel ?? body.experience_level, 160) || null,
    skills: list(body.skills),
    interests: list(body.interests),
    motivation: motivation || null,
    portfolio_url: cleanString(body.portfolioUrl ?? body.portfolio_url, 500) || null,
    source_page: cleanString(body.sourcePage ?? body.source_page, 160, "work-with-us") || "work-with-us",
    status: "pending",
  };

  try {
    const client = getServiceClient();
    const { data, error } = await client
      .from("volunteer_applications")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;

    await Promise.allSettled([
      sendEmail({
        to: email,
        subject: "We received your volunteer application",
        html: `<p>Thanks ${fullName}, we received your volunteer application and will review it shortly.</p>`,
      }),
      sendEmail({
        to: Deno.env.get("STAFF_EMAIL") || "info@whiteimpactinitiative.org",
        subject: `New volunteer application - ${fullName}`,
        html: `<p><strong>Name:</strong> ${fullName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Availability:</strong> ${payload.availability || "-"}</p>`,
      }),
      audit(req, client, {
        action: "volunteer.create",
        entityType: "volunteer_applications",
        entityId: data.id,
        summary: `Volunteer application received for ${fullName}`,
        metadata: { sourcePage: payload.source_page },
      }),
    ]);

    return json(req, 201, { success: true, data });
  } catch {
    return json(req, 500, { success: false, message: "Failed to save volunteer application." });
  }
});
