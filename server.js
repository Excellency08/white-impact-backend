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
 *   GET  /api/health           — Health check
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { initDB } = require("./db/database");
const { testTransporter } = require("./middleware/mailer");
const contactRouter = require("./routes/contact");
const newsletterRouter = require("./routes/newsletter");
const donateRouter = require("./routes/donate");
const teamRouter = require("./routes/team");

const app = express();
const PORT = process.env.PORT || 3030;

/* ─── Security & Middleware ─────────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow img loading
}));

// Parse environment variables (trimming whitespace) or set default fallbacks
const envOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  process.env.FRONTEND_URL,
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
    return ["localhost", "127.0.0.1"].includes(hostname)
      || hostname.startsWith("10.")
      || hostname.startsWith("172.")
      || hostname.startsWith("192.168.");
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser calls (Postman, cURL, server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
      return callback(null, true);
    }
    
    // Returning false lets express-cors handle the denial without throwing a 500 error
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ─── API Request Logger ─────────────────────────────────────────── */
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    const payload = req.method === "GET" ? req.query : req.body;
    const data = payload && Object.keys(payload).length ? ` payload=${JSON.stringify(payload)}` : "";
    console.log(`➡️ [API] ${req.method} ${req.originalUrl}${data}`);
  }
  next();
});

/* ─── Rate Limiting ─────────────────────────────────────────────── */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: "Too many requests. Please try again later." },
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: "Too many submissions. Please try again in an hour." },
});

app.use("/api/", generalLimiter);
app.use("/api/contact", formLimiter);
app.use("/api/donate/initiate", formLimiter);

/* ─── Static uploads ────────────────────────────────────────────── */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ─── Routes ────────────────────────────────────────────────────── */
app.use("/api/contact", contactRouter);
app.use("/api/newsletter", newsletterRouter);
app.use("/api/donate", donateRouter);
app.use("/api/team", teamRouter);

      // health check 
app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/health/detailed", async (_req, res) => {
  const healthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: "unknown",
      mailer: "unknown",
      routes: {
        contact: "configured",
        newsletter: "configured",
        donate: "configured",
        team: "configured",
      },
    },
  };

  try {
    // Check Database Connection
    const { pool } = require("./db/database"); // Adjust to your DB export
    await pool.query("SELECT 1");
    healthStatus.checks.database = "connected";
  } catch (err) {
    healthStatus.status = "degraded";
    healthStatus.checks.database = `error: ${err.message}`;
  }

  try {
    // Check Mail Transporter Connection
    const { transporter } = require("./middleware/mailer"); // Adjust to your mailer export
    if (transporter) {
      await transporter.verify();
      healthStatus.checks.mailer = "connected";
    } else {
      healthStatus.checks.mailer = "not_configured";
    }
  } catch (err) {
    healthStatus.status = "degraded";
    healthStatus.checks.mailer = `error: ${err.message}`;
  }

  const statusCode = healthStatus.status === "ok" ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

/* ─── 404 & Error Handler ───────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error.",
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
      console.error(`Port ${PORT} is already in use. Stop the running process or change BACKEND_PORT.`);
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