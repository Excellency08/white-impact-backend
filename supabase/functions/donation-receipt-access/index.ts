import { getServiceClient, json, parseBody, rateLimit } from "../_shared/common.ts";

const allowedRoles = new Set(["super_admin", "admin", "finance_manager"]);

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "donation-receipt-access", 100, 15 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many requests. Please try again later." });
  }

  const token = bearer(req);
  if (!token) return json(req, 401, { success: false, message: "Authentication is required." });

  const body = await parseBody(req);
  const donationId = Number(body.donationId ?? body.donation_id);
  if (!Number.isInteger(donationId) || donationId <= 0) {
    return json(req, 400, { success: false, message: "Valid donation id is required." });
  }

  try {
    const client = getServiceClient();
    const { data: authUser, error: authError } = await client.auth.getUser(token);
    if (authError || !authUser?.user?.id) {
      return json(req, 401, { success: false, message: "Authentication is invalid." });
    }

    const { data: mapping, error: mappingError } = await client
      .from("user_auth_mapping")
      .select("user_id")
      .eq("auth_user_id", authUser.user.id)
      .maybeSingle();
    if (mappingError) throw mappingError;
    if (!mapping?.user_id) return json(req, 403, { success: false, message: "Application account is not linked." });

    const { data: user, error: userError } = await client
      .from("users")
      .select("id, role, is_active, is_email_verified")
      .eq("id", mapping.user_id)
      .maybeSingle();
    if (userError) throw userError;
    if (!user?.is_active || !user?.is_email_verified || !allowedRoles.has(String(user.role))) {
      return json(req, 403, { success: false, message: "Not authorized to access donation receipts." });
    }

    const { data: donation, error: donationError } = await client
      .from("donations")
      .select("id, receipt_storage_path")
      .eq("id", donationId)
      .maybeSingle();
    if (donationError) throw donationError;
    if (!donation?.receipt_storage_path) {
      return json(req, 404, { success: false, message: "Receipt is not available in private storage." });
    }

    const { data: signed, error: signedError } = await client.storage
      .from("donation-receipts")
      .createSignedUrl(donation.receipt_storage_path, 300);
    if (signedError || !signed?.signedUrl) throw signedError || new Error("Signed URL unavailable.");

    return json(req, 200, {
      success: true,
      data: {
        donationId,
        signedUrl: signed.signedUrl,
        expiresInSeconds: 300,
      },
    });
  } catch {
    return json(req, 500, { success: false, message: "Failed to prepare receipt access." });
  }
});
