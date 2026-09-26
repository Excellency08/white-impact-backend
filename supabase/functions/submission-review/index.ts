import { audit, bearerToken, getServiceClient, htmlEscape, json, parseBody, rateLimit, sendEmail } from "../_shared/common.ts";

const allowedRoles = new Set(["super_admin", "admin", "content_manager"]);
const tables = new Set(["contacts", "volunteers"]);
const allowedStatuses = {
  contacts: new Set(["pending", "responded"]),
  volunteers: new Set(["pending", "approved", "rejected", "reviewed"]),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "submission-review", 100, 15 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many requests. Please try again later." });
  }

  try {
    const client = getServiceClient();
    const token = bearerToken(req);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user?.id) return json(req, 401, { success: false, message: "Authentication is required." });

    const { data: mapping, error: mappingError } = await client
      .from("user_auth_mapping")
      .select("user_id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (mappingError) throw mappingError;
    if (!mapping?.user_id) return json(req, 403, { success: false, message: "Application account is not linked." });

    const { data: user, error: userError } = await client
      .from("users")
      .select("id, role, is_active, is_email_verified")
      .eq("id", mapping.user_id)
      .maybeSingle();
    if (userError) throw userError;
    if (!user?.is_active || !user.is_email_verified || !allowedRoles.has(String(user.role))) {
      return json(req, 403, { success: false, message: "Not authorized to review submissions." });
    }

    const body = await parseBody(req);
    const kind = String(body.kind || "").trim();
    const table = kind === "contacts" ? "contact_submissions" : kind === "volunteers" ? "volunteer_applications" : "";
    const id = Number(body.id);
    const status = String(body.status || "").trim();
    const message = String(body.message || "").trim().slice(0, 2000);
    if (!tables.has(kind) || !table || !Number.isInteger(id) || id <= 0) {
      return json(req, 400, { success: false, message: "A valid submission type and id are required." });
    }
    if (!allowedStatuses[kind as "contacts" | "volunteers"].has(status)) {
      return json(req, 400, { success: false, message: "A valid submission status is required." });
    }
    if (!message) return json(req, 400, { success: false, message: "An appreciation message is required." });

    const { data: existing, error: existingError } = await client
      .from(table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return json(req, 404, { success: false, message: "Submission not found." });

    const update = kind === "volunteers"
      ? { status, reviewed_by: mapping.user_id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status, updated_at: new Date().toISOString() };
    const { data: updated, error: updateError } = await client
      .from(table)
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const recipient = String(updated.email || existing.email || "").trim().toLowerCase();
    if (!recipient) return json(req, 422, { success: false, message: "The submission has no recipient email." });
    const subject = kind === "volunteers"
      ? "Your White Impact volunteer application has been reviewed"
      : "An update from White Impact Development Initiative";
    const email = await sendEmail({
      to: recipient,
      subject,
      html: `<p>Dear ${htmlEscape(updated.full_name || "there")},</p><p>${htmlEscape(message).replaceAll("\n", "<br>")}</p><p>With appreciation,<br>White Impact Development Initiative</p>`,
    });

    await audit(req, client, {
      action: `${kind}.review`,
      entityType: table,
      entityId: id,
      summary: `${kind} submission ${id} marked ${status}`,
      metadata: { status, emailSent: !email.skipped },
    });
    return json(req, 200, {
      success: true,
      data: updated,
      emailSent: !email.skipped,
      message: email.skipped ? "Submission updated, but email delivery is not configured." : "Submission approved and email sent.",
    });
  } catch {
    return json(req, 500, { success: false, message: "Failed to review submission." });
  }
});
