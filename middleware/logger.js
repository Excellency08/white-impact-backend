const crypto = require("crypto");

function getRequestId(req) {
  return req.requestId || req.get("x-request-id") || crypto.randomUUID();
}

function logEntry(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}

function requestLogger(req, res, next) {
  req.requestId = getRequestId(req);
  res.setHeader("X-Request-Id", req.requestId);
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logEntry("info", "http_request", {
      requestId: req.requestId,
      method: req.method,
      route: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.id || null,
    });
  });

  next();
}

module.exports = { logEntry, requestLogger };
