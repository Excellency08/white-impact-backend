import { audit, getServiceClient, htmlEscape, json, normalize, parseBody, rateLimit, sendEmail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "donation-transfer-notify", 15, 60 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many transfer notifications. Please try again later." });
  }

  try {
    const body = await parseBody(req);
    const reference = normalize(body.reference).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!reference) return json(req, 400, { success: false, message: "Donation reference is required." });

    const client = getServiceClient();
    const { data: donation, error: lookupError } = await client.from("donations")
      .select("id, reference, full_name, email, phone, amount_naira, program_area, status, payment_status")
      .eq("reference", reference)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!donation) return json(req, 404, { success: false, message: "Donation reference not found." });

    if (donation.status === "payment_pending") {
      return json(req, 200, {
        success: true,
        alreadyNotified: true,
        message: "Our team has already been notified. Your donation remains pending until staff verify the transfer.",
      });
    }
    if (donation.status !== "pending" || donation.payment_status !== "pending") {
      return json(req, 409, { success: false, message: "This donation is no longer awaiting a transfer notification." });
    }

    const { data: reported, error: updateError } = await client.from("donations").update({
      status: "payment_pending",
      updated_at: new Date().toISOString(),
    })
      .eq("id", donation.id)
      .eq("status", donation.status)
      .eq("payment_status", donation.payment_status)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!reported) {
      return json(req, 409, { success: false, message: "Donation status changed. Refresh and try again." });
    }

    try {
      const email = await sendEmail({
        to: Deno.env.get("STAFF_EMAIL") || "info@whiteimpactinitiative.org",
        subject: `Donor reports bank transfer - ${donation.reference}`,
        html: `<h2>Bank transfer reported by donor</h2><p>The donor says they have sent this transfer. This is a notification only; the payment has not been verified.</p><p><strong>Donor:</strong> ${htmlEscape(donation.full_name || "Not provided")}</p><p><strong>Email:</strong> ${htmlEscape(donation.email || "Not provided")}</p><p><strong>Phone:</strong> ${htmlEscape(donation.phone || "Not provided")}</p><p><strong>Amount:</strong> ₦${Number(donation.amount_naira || 0).toLocaleString()}</p><p><strong>Program:</strong> ${htmlEscape(donation.program_area || "Not specified")}</p><p><strong>Donation reference:</strong> ${htmlEscape(donation.reference)}</p><p>Please reconcile this transfer against the organization's bank records before approving the donation.</p>`,
      });
      if (email.skipped) throw new Error("Staff email delivery is not configured.");
    } catch {
      await client.from("donations").update({
        status: "pending",
        updated_at: new Date().toISOString(),
      }).eq("id", donation.id).eq("status", "payment_pending");
      return json(req, 503, { success: false, message: "We could not notify the team. Please try again or contact info@whiteimpactinitiative.org." });
    }

    await audit(req, client, {
      action: "donation.transfer_reported",
      entityType: "donations",
      entityId: donation.id,
      summary: `Donor reported a bank transfer for ${donation.reference}`,
      metadata: { status: "payment_pending", paymentStatus: "pending" },
    });

    return json(req, 200, {
      success: true,
      message: "Your notification was sent to our team. Your donation remains pending until staff verify the transfer.",
    });
  } catch {
    return json(req, 500, { success: false, message: "Could not send the transfer notification. Please try again." });
  }
});
