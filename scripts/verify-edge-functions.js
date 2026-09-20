const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const functionsRoot = path.join(root, "supabase", "functions");
const publicFunctions = [
  "contact-submit",
  "volunteer-submit",
  "newsletter",
  "analytics-events",
];
const authenticatedFunctions = [
  "donation-receipt-access",
];
const expectedFunctions = [...publicFunctions, ...authenticatedFunctions];
const forbiddenPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=/,
  /SUPABASE_SECRET_KEY\s*=/,
  /DATABASE_URL\s*=/,
  /DIRECT_URL\s*=/,
  /JWT_ACCESS_SECRET\s*=/,
  /JWT_REFRESH_SECRET\s*=/,
  /RESEND_API_KEY\s*=/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const failures = [];

if (!exists("supabase/config.toml")) failures.push("supabase/config.toml is missing");
if (!exists("supabase/functions/_shared/common.ts")) failures.push("shared Edge helper is missing");

for (const name of expectedFunctions) {
  const relative = `supabase/functions/${name}/index.ts`;
  if (!exists(relative)) {
    failures.push(`${name}: index.ts is missing`);
    continue;
  }
  const source = read(relative);
  if (!source.includes("Deno.serve")) failures.push(`${name}: Deno.serve handler is missing`);
  if (!source.includes("rateLimit(")) failures.push(`${name}: rate limiter is missing`);
  if (!source.includes("getServiceClient(")) failures.push(`${name}: server-side Supabase client is missing`);
  if (!source.includes("OPTIONS")) failures.push(`${name}: preflight handling is missing`);
  if (source.includes("delete(") || source.includes(".delete()")) failures.push(`${name}: unexpected delete operation found`);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) failures.push(`${name}: source appears to contain a secret-like assignment`);
  }
}

const config = exists("supabase/config.toml") ? read("supabase/config.toml") : "";
for (const name of publicFunctions) {
  if (!config.includes(`[functions.${name}]`)) failures.push(`${name}: config section is missing`);
  if (!new RegExp(`\\[functions\\.${name}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`).test(config)) {
    failures.push(`${name}: public invocation JWT setting is not explicit`);
  }
}
for (const name of authenticatedFunctions) {
  const relative = `supabase/functions/${name}/index.ts`;
  const source = exists(relative) ? read(relative) : "";
  if (!config.includes(`[functions.${name}]`)) failures.push(`${name}: config section is missing`);
  if (!new RegExp(`\\[functions\\.${name}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`).test(config)) {
    failures.push(`${name}: authenticated invocation JWT setting is not explicit`);
  }
  if (!source.includes("createSignedUrl")) failures.push(`${name}: signed URL generation is missing`);
  if (source.includes("receipt_storage_path") && source.includes("body.receipt")) {
    failures.push(`${name}: must not accept a client-supplied receipt path`);
  }
}

const shared = exists("supabase/functions/_shared/common.ts")
  ? read("supabase/functions/_shared/common.ts")
  : "";
for (const symbol of ["getServiceClient", "corsHeaders", "rateLimit", "sendEmail", "audit"]) {
  if (!shared.includes(`function ${symbol}`)) failures.push(`shared helper missing ${symbol}`);
}
for (const pattern of forbiddenPatterns) {
  if (pattern.test(shared)) failures.push("shared helper appears to contain a secret-like assignment");
}

const passed = failures.length === 0;
console.log(JSON.stringify({
  mode: "edge-function-static-verification",
  destructiveChanges: false,
  passed,
  functionsChecked: expectedFunctions.length,
  typeCheck: "blocked-without-deno",
  deployment: "not-attempted-static-verification-only",
  failures,
}, null, 2));
if (!passed) process.exitCode = 1;
