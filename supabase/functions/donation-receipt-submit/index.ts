import { audit, getServiceClient, htmlEscape, json, normalize, rateLimit, sendEmail } from "../_shared/common.ts";

const types: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

async function checksum(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { bytes, sha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "donation-receipt-submit", 20, 60 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many receipt uploads. Please try again later." });
  }

  try {
    const form = await req.formData();
    const reference = normalize(form.get("reference")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    const file = form.get("receipt");
    if (!reference) return json(req, 400, { success: false, message: "Donation reference is required." });
    if (!(file instanceof File) || !types[file.type] || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      return json(req, 400, { success: false, message: "Please upload a valid receipt under 5 MB." });
    }

    const client = getServiceClient();
    const { data: donation, error: lookupError } = await client.from("donations")
      .select("id, reference, full_name, email, amount_naira, program_area")
      .eq("reference", reference)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!donation) return json(req, 404, { success: false, message: "Donation reference not found." });

    const { bytes, sha256 } = await checksum(file);
    const objectPath = `uploads/receipts/${donation.id}/receipt-${crypto.randomUUID()}.${types[file.type]}`;
    const upload = await client.storage.from("donation-receipts").upload(objectPath, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const { error: updateError } = await client.from("donations").update({
      status: "receipt_submitted",
      payment_status: "receipt_submitted",
      receipt_storage_path: objectPath,
      receipt_sha256: sha256,
      receipt_mime_type: file.type,
      receipt_size_bytes: file.size,
      confirmation_method: "receipt",
      updated_at: new Date().toISOString(),
    }).eq("id", donation.id);
    if (updateError) throw updateError;

    await Promise.allSettled([
      sendEmail({
        to: Deno.env.get("STAFF_EMAIL") || "info@whiteimpactinitiative.org",
        subject: `Donation receipt submitted - ${reference}`,
        html: `<p><strong>Reference:</strong> ${htmlEscape(reference)}</p><p><strong>Donor:</strong> ${htmlEscape(donation.full_name)} (${htmlEscape(donation.email)})</p><p><strong>Amount:</strong> ₦${Number(donation.amount_naira || 0).toLocaleString()}</p>`,
      }),
      sendEmail({
        to: donation.email,
        subject: "Receipt received - White Impact Development Initiative",
        html: `<p>Thank you, ${htmlEscape(donation.full_name)}. We received your payment receipt for donation reference <strong>${htmlEscape(reference)}</strong>.</p>`,
      }),
      audit(req, client, {
        action: "donation.receipt",
        entityType: "donations",
        entityId: donation.id,
        summary: `Receipt uploaded for donation ${reference}`,
      }),
    ]);

    return json(req, 200, { success: true, message: "Receipt submitted successfully. We will confirm your donation shortly.", reference });
  } catch {
    return json(req, 500, { success: false, message: "Receipt upload failed. Please try again." });
  }
});
