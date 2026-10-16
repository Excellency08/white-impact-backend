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
      return json(req, 403, { success: false, message: "Not authorized to review donations." });
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

    if (String(body.decision || "").trim().toLowerCase() === "reject") {
      const rejectionMessage = String(body.rejectionMessage || "").trim().slice(0, 2000);
      if (!rejectionMessage) {
        return json(req, 400, { success: false, message: "A rejection explanation is required." });
      }
      const alreadyApproved = existing.status === "verified" || existing.payment_status === "succeeded";
      if (alreadyApproved) {
        return json(req, 409, { success: false, message: "An approved donation cannot be rejected." });
      }
      const alreadyRejected = existing.status === "rejected";
      if (alreadyRejected) {
        const { data: previousNotice, error: noticeLookupError } = await client.from("audit_logs")
          .select("metadata")
          .eq("entity_type", "donations")
          .eq("entity_id", String(donationId))
          .eq("action", "donation.reject")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (noticeLookupError) throw noticeLookupError;
        if (previousNotice?.metadata?.emailSent === true) {
          return json(req, 200, {
            success: true,
            data: existing,
            emailSent: true,
            message: "This donation is already rejected and the donor has been notified.",
          });
        }
      }

      let rejected = existing;
      if (!alreadyRejected) {
        const { data: updatedDonation, error: rejectError } = await client.from("donations").update({
          status: "rejected",
          payment_status: "failed",
          confirmation_method: "admin_rejected",
          updated_at: new Date().toISOString(),
        })
          .eq("id", donationId)
          .eq("status", existing.status)
          .eq("payment_status", existing.payment_status)
          .select("*")
          .maybeSingle();
        if (rejectError) throw rejectError;
        if (!updatedDonation) {
          return json(req, 409, { success: false, message: "Donation status changed during review. Refresh and try again." });
        }
        rejected = updatedDonation;
      }

      let emailSent = false;
      try {
        const email = await sendEmail({
          to: rejected.email,
          subject: `Update on your donation - ${rejected.reference}`,
          html: `<h2>Update on your donation, ${htmlEscape(rejected.full_name || "there")}</h2><p>We have not been able to verify receipt of your bank transfer for this donation.</p><p><strong>Donor:</strong> ${htmlEscape(rejected.full_name || "Not provided")}</p><p><strong>Email:</strong> ${htmlEscape(rejected.email || "Not provided")}</p><p><strong>Phone:</strong> ${htmlEscape(rejected.phone || "Not provided")}</p><p><strong>Donation amount:</strong> ₦${Number(rejected.amount_naira || 0).toLocaleString()}</p><p><strong>Donation reference:</strong> ${htmlEscape(rejected.reference)}</p><p><strong>Program:</strong> ${htmlEscape(rejected.program_area || "Not specified")}</p><p><strong>Review message:</strong><br>${htmlEscape(rejectionMessage).replaceAll("\n", "<br>")}</p><p>If you already completed the transfer, please contact <a href="mailto:info@whiteimpactinitiative.org">info@whiteimpactinitiative.org</a> and include your donation reference and bank transaction reference so our team can investigate. Please wait for our response before submitting another donation.</p><p>Regards,<br>White Impact Development Initiative</p>`,
        });
        emailSent = !email.skipped;
      } catch {
        emailSent = false;
      }

      await audit(req, client, {
        action: "donation.reject",
        entityType: "donations",
        entityId: donationId,
        summary: `Donation ${donationId} rejected`,
        metadata: { status: "rejected", paymentStatus: "failed", rejectionMessage, emailSent },
      });
      return json(req, 200, {
        success: true,
        data: rejected,
        emailSent,
        message: emailSent
          ? "Donation rejected and donor notified."
          : "Donation rejected, but the donor email could not be sent. Try sending the rejection notice again.",
      });
    }

    if (existing.status === "rejected") {
      return json(req, 409, { success: false, message: "A rejected donation cannot be approved through this action." });
    }

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
