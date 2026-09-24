import { audit, getServiceClient, htmlEscape, json, parseBody, rateLimit, sendEmail } from "../_shared/common.ts";

const allowedRoles = new Set(["super_admin", "admin", "finance_manager"]);

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "donation-approve", 100, 15 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many requests. Please try again later." });
  }

  try {
    const client = getServiceClient();
    const token = bearer(req);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user?.id) return json(req, 401, { success: false, message: "Authentication is required." });

    const { data: mapping, error: mappingError } = await client.from("user_auth_mapping")
      .select("user_id").eq("auth_user_id", authData.user.id).maybeSingle();
    if (mappingError) throw mappingError;
    if (!mapping?.user_id) return json(req, 403, { success: false, message: "Application account is not linked." });

    const { data: user, error: userError } = await client.from("users")
      .select("id, role, is_active, is_email_verified").eq("id", mapping.user_id).maybeSingle();
    if (userError) throw userError;
    if (!user?.is_active || !user.is_email_verified || !allowedRoles.has(String(user.role))) {
      return json(req, 403, { success: false, message: "Not authorized to approve donations." });
    }

    const body = await parseBody(req);
    const donationId = Number(body.donationId ?? body.donation_id);
    if (!Number.isInteger(donationId) || donationId <= 0) return json(req, 400, { success: false, message: "Valid donation id is required." });
    const nextStatus = String(body.status || "pending").trim();
    const nextPaymentStatus = String(body.paymentStatus || nextStatus).trim();
    const confirmationMethod = String(body.confirmationMethod || (nextPaymentStatus === "succeeded" ? "admin_approved" : "")).trim() || null;
    const approvalMessage = String(body.approvalMessage || "").trim().slice(0, 2000);
    const { data: existing, error: existingError } = await client.from("donations")
      .select("*").eq("id", donationId).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return json(req, 404, { success: false, message: "Donation not found." });

    const wasApproved = existing.status === "verified" || existing.payment_status === "succeeded";
    const isApproved = nextStatus === "verified" || nextPaymentStatus === "succeeded";
    const { data: updated, error: updateError } = await client.from("donations").update({
      status: nextStatus,
      payment_status: nextPaymentStatus,
      confirmation_method: confirmationMethod,
      verified_at: nextPaymentStatus === "succeeded" ? (existing.verified_at || new Date().toISOString()) : existing.verified_at,
      paid_at: nextPaymentStatus === "succeeded" ? (existing.paid_at || new Date().toISOString()) : existing.paid_at,
      verified_by: mapping.user_id,
      updated_at: new Date().toISOString(),
    }).eq("id", donationId).select("*").single();
    if (updateError) throw updateError;

    let emailSent: boolean | null = null;
    if (isApproved && !wasApproved) {
      const message = approvalMessage || "Thank you for supporting our work and helping us create lasting impact in our communities.";
      try {
        const email = await sendEmail({
          to: updated.email,
          subject: `Donation approved - ${updated.reference}`,
          html: `<h2>Thank you, ${htmlEscape(updated.full_name || "there")}</h2><p>We have received and approved your donation to White Impact Development Initiative.</p><p><strong>Reference:</strong> ${htmlEscape(updated.reference)}</p><p><strong>Amount:</strong> ₦${Number(updated.amount_naira || 0).toLocaleString()}</p><p>${htmlEscape(message).replaceAll("\n", "<br>")}</p><p>With appreciation,<br>White Impact Development Initiative</p>`,
        });
        emailSent = email.skipped ? false : true;
      } catch {
        emailSent = false;
      }
    }

    await audit(req, client, {
      action: "donation.update",
      entityType: "donations",
      entityId: donationId,
      summary: `Donation ${donationId} updated`,
      metadata: { status: nextStatus, paymentStatus: nextPaymentStatus },
    });
    return json(req, 200, {
      success: true,
      data: updated,
      emailSent,
      message: emailSent === false ? "Donation approved, but the donor email could not be sent." : isApproved && !wasApproved ? "Donation approved and donor notified." : "Donation updated successfully.",
    });
  } catch {
    return json(req, 500, { success: false, message: "Failed to update donation." });
  }
});
