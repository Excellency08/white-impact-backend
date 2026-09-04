/**
 * GET  /api/team         — Get all active team members
 * POST /api/team/photo   — Upload a team member photo (multipart/form-data)
 * PUT  /api/team/:id     — Update team member details
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { query } = require("../db/database");
const fs = require("fs");
const { requireAuth, requireRole } = require("../middleware/auth");

/* ─── Multer storage config ─────────────────────────────────────── */
const uploadsDir = path.join(__dirname, "../uploads/team");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `team-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
    }
  },
});

/* ─── GET /api/team ─────────────────────────────────────────────── */
router.get("/", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const { rows } = await query(
      `SELECT id, full_name, role, bio, photo_url, display_order
       FROM team_members WHERE is_active = TRUE ORDER BY display_order ASC`,
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Team fetch error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load team members." });
  }
});

/* ─── GET /api/team/admin ──────────────────────────────────────── */
router.get(
  "/admin",
  requireAuth,
  requireRole("super_admin", "admin", "content_manager"),
  async (_req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const { rows } = await query(
        `SELECT id, full_name, role, bio, photo_url, display_order, is_active
         FROM team_members ORDER BY display_order ASC, id ASC`,
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Admin team fetch error:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to load team members." });
    }
  },
);

/* ─── POST /api/team ────────────────────────────────────────────── */
router.post(
  "/",
  requireAuth,
  requireRole("super_admin", "admin", "content_manager"),
  async (req, res) => {
    const { fullName, role, bio, photoUrl, displayOrder, isActive } = req.body;

    if (!fullName || !role) {
      return res
        .status(400)
        .json({ success: false, message: "fullName and role are required." });
    }

    try {
      const { rows } = await query(
        `INSERT INTO team_members (full_name, role, bio, photo_url, display_order, is_active)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, TRUE))
       RETURNING id, full_name, role, bio, photo_url, display_order, is_active`,
        [
          fullName,
          role,
          bio || null,
          photoUrl || null,
          displayOrder,
          typeof isActive === "boolean" ? isActive : undefined,
        ],
      );

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Team create error:", err);
      res.status(500).json({ success: false, message: "Create failed." });
    }
  },
);

/* ─── POST /api/team/photo ──────────────────────────────────────── */
router.post(
  "/photo",
  requireAuth,
  requireRole("super_admin", "admin", "content_manager"),
  upload.single("photo"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No photo uploaded." });
    }

    const { memberId } = req.body;
    if (!memberId) {
      // Remove uploaded file if no memberId
      fs.unlink(req.file.path, () => {});
      return res
        .status(400)
        .json({ success: false, message: "memberId is required." });
    }

    const photoUrl = `/uploads/team/${req.file.filename}`;

    try {
      const { rowCount } = await query(
        `UPDATE team_members SET photo_url = $1 WHERE id = $2 AND is_active = TRUE`,
        [photoUrl, memberId],
      );

      if (rowCount === 0) {
        fs.unlink(req.file.path, () => {});
        return res
          .status(404)
          .json({ success: false, message: "Team member not found." });
      }

      res.json({ success: true, photo_url: photoUrl });
    } catch (err) {
      console.error("Photo upload error:", err);
      fs.unlink(req.file.path, () => {});
      res
        .status(500)
        .json({ success: false, message: "Failed to save photo." });
    }
  },
);

/* ─── PUT /api/team/:id ─────────────────────────────────────────── */
router.put(
  "/:id",
  requireAuth,
  requireRole("super_admin", "admin", "content_manager"),
  async (req, res) => {
    const { id } = req.params;
    const { fullName, role, bio, photoUrl, displayOrder, isActive } = req.body;

    try {
      const { rows } = await query(
        `UPDATE team_members
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2, role),
           bio = COALESCE($3, bio),
           photo_url = COALESCE($4, photo_url),
           display_order = COALESCE($5, display_order),
           is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING id, full_name, role, bio, photo_url, display_order, is_active`,
        [
          fullName,
          role,
          bio,
          photoUrl,
          displayOrder,
          typeof isActive === "boolean" ? isActive : undefined,
          id,
        ],
      );

      if (rows.length === 0)
        return res
          .status(404)
          .json({ success: false, message: "Member not found." });
      res.json({
        success: true,
        message: "Team member updated.",
        data: rows[0],
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Update failed." });
    }
  },
);

module.exports = router;
