const assert = require("node:assert/strict");

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3030").replace(
  /\/$/,
  "",
);

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

async function main() {
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.success, true);

  const event = await request("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventKey: "page_view",
      pagePath: "/index.html",
      metadata: { source: "smoke-test" },
    }),
  });
  assert.equal(event.response.status, 202);
  assert.equal(event.body.success, true);

  const invalidEvent = await request("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventKey: "email_address" }),
  });
  assert.equal(invalidEvent.response.status, 400);

  console.log(`Smoke tests passed against ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
