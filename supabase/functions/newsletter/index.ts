import { audit, getServiceClient, json, normalizeEmail, parseBody, rateLimit, sendEmail, validateEmail } from "../_shared/common.ts";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

function token() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function siteUrl() {
  return (Deno.env.get("SITE_URL") || Deno.env.get("FRONTEND_URL") || "https://whiteimpactinitiative.org").replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "newsletter", 100, 15 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many requests. Please try again later." });
  }

  const pathname = new URL(req.url).pathname;
  const action = pathname.endsWith("/confirm") ? "confirm" : pathname.endsWith("/unsubscribe") ? "unsubscribe" : "subscribe";
  const body = await parseBody(req);
  const client = getServiceClient();

  try {
    if (action === "subscribe") {
      const email = normalizeEmail(body.email);
      const fullName = String(body.fullName || body.full_name || "").trim();
      const sourcePage = String(body.sourcePage || body.source_page || "website").trim() || "website";
      if (!validateEmail(email)) {
        return json(req, 400, { success: false, message: "Please provide a valid email address." });
      }

      const confirmationToken = token();
      const unsubscribeToken = token();
      const { error } = await client.from("newsletter_subs").upsert({
        email,
        full_name: fullName || null,
        source_page: sourcePage,
        status: "pending",
        is_active: false,
        confirmation_token_hash: await sha256(confirmationToken),
        unsubscribe_token_hash: await sha256(unsubscribeToken),
        confirmation_sent_at: new Date().toISOString(),
        confirmed_at: null,
        unsubscribed_at: null,
      }, { onConflict: "email" });
      if (error) throw error;

      const confirmUrl = `${siteUrl()}/newsletter-confirmation.html?token=${encodeURIComponent(confirmationToken)}`;
      const unsubscribeUrl = `${siteUrl()}/newsletter-unsubscribe.html?token=${encodeURIComponent(unsubscribeToken)}`;
      await Promise.allSettled([
        sendEmail({
          to: email,
          subject: "Confirm your White Impact newsletter subscription",
          html: `<p>Hi ${fullName || "there"},</p><p>Please confirm your subscription to receive White Impact updates.</p><p><a href="${confirmUrl}">Confirm subscription</a></p><p>Unsubscribe anytime: <a href="${unsubscribeUrl}">Manage subscription</a></p>`,
        }),
        audit(req, client, {
          action: "newsletter.subscribe",
          entityType: "newsletter_subs",
          entityId: email,
          summary: "Newsletter subscription requested",
          metadata: { sourcePage },
        }),
      ]);
      return json(req, 201, { success: true, message: "Subscription received. Check your inbox to confirm." });
    }

    const providedToken = String(body.token || "").trim();
    if (!providedToken) {
      return json(req, 400, { success: false, message: `${action === "confirm" ? "Confirmation" : "Unsubscribe"} token is required.` });
    }
    const hash = await sha256(providedToken);
    const matchColumn = action === "confirm" ? "confirmation_token_hash" : "unsubscribe_token_hash";
    const { data: subscriber, error: lookupError } = await client
      .from("newsletter_subs")
      .select("id, email")
      .eq(matchColumn, hash)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!subscriber) return json(req, 404, { success: false, message: "Newsletter subscription not found." });

    const update = action === "confirm"
      ? { is_active: true, status: "confirmed", confirmed_at: new Date().toISOString(), confirmation_token_hash: null }
      : { is_active: false, status: "unsubscribed", unsubscribed_at: new Date().toISOString() };
    const { error: updateError } = await client.from("newsletter_subs").update(update).eq("id", subscriber.id);
    if (updateError) throw updateError;
    await audit(req, client, {
      action: action === "confirm" ? "newsletter.confirm" : "newsletter.unsubscribe",
      entityType: "newsletter_subs",
      entityId: subscriber.email,
      summary: action === "confirm" ? "Newsletter confirmed" : "Newsletter unsubscribed",
    });
    return json(req, 200, { success: true, message: action === "confirm" ? "Subscription confirmed." : "You have been unsubscribed." });
  } catch {
    return json(req, 500, { success: false, message: "Newsletter request failed. Please try again." });
  }
});
