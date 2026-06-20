/**
 * WhiteImpact Development Initiative — Backend API
 * Node.js + Express + PostgreSQL
 *
 * Endpoints:
 *   POST /api/contact          — Work With Us contact form
 *   POST /api/newsletter       — Newsletter subscription
 *   POST /api/donate/initiate  — Initiate Paystack payment
 *   GET  /api/donate/verify    — Verify Paystack callback
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
const PORT = process.env.PORT || 3000;

/* ─── Security & Middleware ─────────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow img loading
}));

app.use(cors({ 
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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

app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "ok", timestamp: new Date().toISOString() });
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
  app.listen(PORT, () => {
    console.log(`\n✅ WhiteImpact API running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});