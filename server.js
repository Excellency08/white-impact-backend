/**
 * WhiteImpact Development Initiative — Backend API
 * Node.js + Express + PostgreSQL
 *
 * Endpoints:
 *   POST /api/contact          — Work With Us contact form
 *   POST /api/newsletter       — Newsletter subscription
 *   POST /api/donate/initiate  — Record donation & return bank details
 *   POST /api/donate/receipt   — Upload payment receipt
 *   POST /api/team/photo       — Upload team member photo
 *   GET  /api/team             — Get all team members
 *   GET  /api/health           — Basic health check
 *   GET  /api/health/detailed  — Comprehensive system readiness check
 *
 * Versioned aliases are also exposed under /api/v1/*
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { initDB } = require("./db/database");
const { testTransporter } = require("./middleware/mailer");
const contactRouter = require("./routes/contact");
const newsletterRouter = require("./routes/newsletter");
const donateRouter = require("./routes/donate");
const teamRouter = require("./routes/team");
const authRouter = require("./routes/auth");
const impactRouter = require("./routes/impact");
const programsRouter = require("./routes/programs");
const projectsRouter = require("./routes/projects");
const initiativesRouter = require("./routes/initiatives");
const storiesRouter = require("./routes/stories");
const newsRouter = require("./routes/news");
const reportsRouter = require("./routes/reports");
const cmsRouter = require("./routes/cms");
const mediaRouter = require("./routes/media");
const volunteersRouter = require("./routes/volunteers");
const searchRouter = require("./routes/search");
const analyticsRouter = require("./routes/analytics");
const { logEntry, requestLogger } = require("./middleware/logger");

const app = express();
const PORT = process.env.PORT || 3030;

/* ─── Proxy Settings for hosted deployments ────────────────────── */
app.set("trust proxy", 1); // Required when the API is behind a reverse proxy.

/* ─── Security & Middleware ─────────────────────────────────────── */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow img loading
  }),
);

// Parse environment variables or set default fallbacks
const envOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.CORS_ORIGIN ||
  ""
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  process.env.FRONTEND_URL,
  "https://white-impact-frontend.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
].filter(Boolean);

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));

function isLocalDevOrigin(origin) {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname;
    return (
      ["localhost", "127.0.0.1"].includes(hostname) ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.startsWith("192.168.")
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser calls (Postman, cURL, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
        return callback(null, true);
      }

      // Returning false lets express-cors reject clean without throwing 500
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(requestLogger);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ─── Rate Limiting ─────────────────────────────────────────────── */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: "Too many submissions. Please try again in an hour.",
  },
});

const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    message: "Too many analytics events. Please try again later.",
  },
});

app.use("/api/", generalLimiter);
app.use("/api/contact", formLimiter);
app.use("/api/donate/initiate", formLimiter);
app.use("/api/analytics/events", analyticsLimiter);

/* ─── Static uploads ────────────────────────────────────────────── */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ─── Routes ────────────────────────────────────────────────────── */
app.use("/api/contact", contactRouter);
app.use("/api/newsletter", newsletterRouter);
app.use("/api/donate", donateRouter);
app.use("/api/team", teamRouter);
app.use("/api/auth", authRouter);
app.use("/api/impact", impactRouter);
app.use("/api/programs", programsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/initiatives", initiativesRouter);
app.use("/api/stories", storiesRouter);
app.use("/api/news", newsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/cms", cmsRouter);
app.use("/api/media", mediaRouter);
app.use("/api/volunteers", volunteersRouter);
app.use("/api/search", searchRouter);
app.use("/api/analytics", analyticsRouter);

app.use("/api/v1/contact", contactRouter);
app.use("/api/v1/newsletter", newsletterRouter);
app.use("/api/v1/donate", donateRouter);
app.use("/api/v1/team", teamRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/impact", impactRouter);
app.use("/api/v1/programs", programsRouter);
app.use("/api/v1/projects", projectsRouter);
app.use("/api/v1/initiatives", initiativesRouter);
app.use("/api/v1/stories", storiesRouter);
app.use("/api/v1/news", newsRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/cms", cmsRouter);
app.use("/api/v1/media", mediaRouter);
app.use("/api/v1/volunteers", volunteersRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/analytics", analyticsRouter);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    name: "White Impact API",
    status: "ok",
    health: "/api/health",
    api: "/api",
  });
});

app.get("/robots.txt", (_req, res) => {
  res
    .type("text/plain")
    .send(
      `User-agent: *\nAllow: /\nSitemap: ${process.env.SITE_URL || process.env.FRONTEND_URL || "http://localhost:5500"}/sitemap.xml\n`,
    );
});

app.get("/sitemap.xml", async (_req, res) => {
  try {
    const siteUrl = (
      process.env.SITE_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5500"
    ).replace(/\/$/, "");
    const { rows: newsRows } = await require("./db/database").query(
      `SELECT slug FROM news_posts WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 100`,
    );
    const { rows: storyRows } = await require("./db/database").query(
      `SELECT slug FROM stories WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 100`,
    );
    const { rows: projectRows } = await require("./db/database").query(
      `SELECT slug FROM projects WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 100`,
    );
    const { rows: reportRows } = await require("./db/database").query(
      `SELECT slug FROM reports WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 100`,
    );
    const urls = [
      "",
      "about.html",
      "our-story.html",
      "solutions.html",
      "projects.html",
      "stories.html",
      "news.html",
      "reports.html",
      "partner-with-us.html",
      "work-with-us.html",
      "donate.html",
      "search.html",
      "newsletter-confirmation.html",
      "newsletter-unsubscribe.html",
      "privacy-policy.html",
      "terms-of-use.html",
      ...storyRows.map(
        (row) => `story.html?slug=${encodeURIComponent(row.slug)}`,
      ),
      ...newsRows.map(
        (row) => `news-article.html?slug=${encodeURIComponent(row.slug)}`,
      ),
      ...projectRows.map(
        (row) => `project.html?slug=${encodeURIComponent(row.slug)}`,
      ),
      ...reportRows.map(
        (row) => `report.html?slug=${encodeURIComponent(row.slug)}`,
      ),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((url) => `  <url><loc>${siteUrl}/${url}</loc></url>`)
      .join("\n")}\n</urlset>`;
    res.type("application/xml").send(body);
  } catch (error) {
    logEntry("error", "sitemap_generation_failed", {
      requestId: _req.requestId,
      message: error.message,
    });
    res.status(500).type("text/plain").send("Unable to generate sitemap.");
  }
});

/* ─── Health Checks ─────────────────────────────────────────────── */
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    version: "v1",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health/detailed", async (_req, res) => {
  const diagnostics = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    services: {
      database: "testing...",
      mailer: "testing...",
      routes: {
        contact: "configured",
        newsletter: "configured",
        donate: "configured",
        team: "configured",
        auth: "configured",
        impact: "configured",
        programs: "configured",
        projects: "configured",
        stories: "configured",
        news: "configured",
        reports: "configured",
        cms: "configured",
        media: "configured",
        volunteers: "configured",
        search: "configured",
        analytics: "configured",
      },
    },
  };

  try {
    const { pool } = require("./db/database");
    if (pool) {
      await pool.query("SELECT 1");
      diagnostics.services.database = "connected";
    } else {
      diagnostics.services.database = "not_initialized";
    }
  } catch (err) {
    diagnostics.status = "degraded";
    diagnostics.services.database = `error: ${err.message}`;
  }

  try {
    const mailResult = await testTransporter();
    diagnostics.services.mailer =
      mailResult.mode === "real"
        ? "connected"
        : `mock (${mailResult.error || "no credentials"})`;
    if (mailResult.mode !== "real") {
      diagnostics.status = "degraded";
    }
  } catch (err) {
    diagnostics.status = "degraded";
    diagnostics.services.mailer = `error: ${err.message}`;
  }

  const statusCode = diagnostics.status === "ok" ? 200 : 503;
  res.status(statusCode).json(diagnostics);
});

/* ─── 404 & Error Handler ───────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

app.use((err, req, res, _next) => {
  logEntry("error", "unhandled_error", {
    requestId: req.requestId,
    method: req.method,
    route: req.originalUrl.split("?")[0],
    message: err.message || "Internal server error.",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
  res.status(err.status || 500).json({
    success: false,
    requestId: req.requestId,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error."
        : err.message || "Internal server error.",
  });
});

/* ─── Start ─────────────────────────────────────────────────────── */
async function start() {
  await initDB();
  await testTransporter();

  const server = app.listen(PORT, () => {
    console.log(`\n✅ WhiteImpact API running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop the running process or change BACKEND_PORT.`,
      );
    } else {
      console.error("Server error:", err);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
