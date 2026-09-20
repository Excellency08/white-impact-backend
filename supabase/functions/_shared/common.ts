import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

export type JsonRecord = Record<string, unknown>;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!url || !key) throw new Error("Supabase server configuration is unavailable.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("CORS_ORIGIN") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const defaults = [
    Deno.env.get("FRONTEND_URL") || "",
    "https://white-impact-frontend.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ].filter(Boolean);
  const allowed = new Set([...configured, ...defaults]);
  let allowOrigin = "";
  try {
    const host = new URL(origin).hostname;
    if (allowed.has(origin) || host === "localhost" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("172.") || host.startsWith("192.168.")) {
      allowOrigin = origin;
    }
  } catch {
    allowOrigin = "";
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

export async function parseBody(req: Request) {
  try {
    return (await req.json()) as JsonRecord;
  } catch {
    return {};
  }
}

export function normalize(value: unknown, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export function normalizeEmail(value: unknown) {
  return normalize(value).toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string) {
  return /^[\d\s\-+()]{10,}$/.test(phone);
}

export function cleanString(value: unknown, max: number, fallback = "") {
  return normalize(value, fallback).slice(0, max);
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
}

export function rateLimit(req: Request, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const current = rateBuckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= max;
}

export async function sendEmail(input: { to: string; subject: string; html: string }) {
  const sendEmails = (Deno.env.get("SEND_EMAILS") || "true").toLowerCase() !== "false";
  const mockEmail = (Deno.env.get("MOCK_EMAIL") || "false").toLowerCase() === "true";
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!sendEmails || mockEmail || !apiKey) {
    return { skipped: true };
  }

  const from = Deno.env.get("FROM_EMAIL") || "White Impact <noreply@whiteimpactinitiative.org>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!response.ok) throw new Error("Email delivery failed.");
  return { skipped: false };
}

export async function audit(
  req: Request,
  client: ReturnType<typeof createClient>,
  row: {
    action: string;
    entityType: string;
    entityId?: string | number | null;
    summary?: string;
    metadata?: JsonRecord;
  },
) {
  await client.from("audit_logs").insert({
    action: row.action,
    entity_type: row.entityType,
    entity_id: row.entityId === undefined || row.entityId === null ? null : String(row.entityId),
    summary: row.summary || null,
    metadata: row.metadata || {},
    ip_address: clientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
}
