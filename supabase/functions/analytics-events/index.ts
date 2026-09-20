import { cleanString, getServiceClient, json, parseBody, rateLimit } from "../_shared/common.ts";

const allowedEvents = new Set([
  "page_view",
  "report_download",
  "search",
  "newsletter_signup",
  "donation_started",
  "contact_submitted",
]);

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 12)
      .filter(([key, item]) => /^[a-zA-Z0-9_-]{1,40}$/.test(key) && ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 160) : item]),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 204, {});
  if (req.method !== "POST") return json(req, 405, { success: false, message: "Method not allowed." });
  if (!rateLimit(req, "analytics-events", 120, 15 * 60 * 1000)) {
    return json(req, 429, { success: false, message: "Too many analytics events. Please try again later." });
  }

  const body = await parseBody(req);
  const eventKey = cleanString(body.eventKey, 80);
  if (!allowedEvents.has(eventKey)) {
    return json(req, 400, { success: false, message: "Unsupported analytics event." });
  }

  try {
    const client = getServiceClient();
    const { error } = await client.from("analytics_events").insert({
      event_key: eventKey,
      page_path: cleanString(body.pagePath, 255) || null,
      referrer: cleanString(body.referrer, 500) || null,
      session_id: cleanString(body.sessionId, 120) || null,
      metadata: cleanMetadata(body.metadata),
    });
    if (error) throw error;
    return json(req, 202, { success: true });
  } catch {
    return json(req, 503, { success: false, message: "Analytics is temporarily unavailable." });
  }
});
