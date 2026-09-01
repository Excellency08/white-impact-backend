/**
 * Media library for uploaded images, PDFs, documents, videos, and logos.
 */

const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];
const MEDIA_DIR = path.join(__dirname, "../uploads/media");

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function requireMediaAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    requireRole(...ADMIN_ROLES)(req, res, next),
  );
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return Boolean(value);
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseJsonField(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;

  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch {
    return fallback;
  }
}

function jsonValue(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function removeMediaFile(fileUrl) {
  if (!fileUrl || !String(fileUrl).startsWith("/uploads/media/")) return;
  const filePath = path.join(
    __dirname,
    "..",
    String(fileUrl).replace(/^\//, ""),
  );
  fs.unlink(filePath, () => {});
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext);
    const safeBase = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    cb(null, `${safeBase || "media"}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MEDIA.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported media type."));
  },
});

function inferCategory(file, fallback = "image") {
  if (!file) return fallback;
  if (file.mimetype.startsWith("image/")) return "image";
  if (file.mimetype === "application/pdf") return "pdf";
  if (
    file.mimetype === "application/msword" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "document";
  }
  if (file.mimetype.startsWith("video/")) return "video";
  return fallback;
}

function formatMedia(row) {
  return {
    id: row.id,
    assetKey: row.asset_key,
    title: row.title,
    description: row.description || "",
    category: row.category || "image",
    usageType: row.usage_type || "general",
    altText: row.alt_text || "",
    caption: row.caption || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    fileUrl: row.file_url,
    fileName: row.file_name || path.basename(row.file_url || ""),
    storagePath: row.storage_path || "",
    storageProvider: row.storage_provider || "local",
    mimeType: row.mime_type || "",
    fileSize: Number(row.file_size || 0),
    fileExtension: row.file_extension || "",
    status: row.status || "Draft",
    displayOrder: Number(row.display_order || 0),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildMediaPayload(body, file, existing = {}) {
  const fileUrl = file
    ? `/uploads/media/${file.filename}`
    : String(body.fileUrl || body.file_url || existing.file_url || "").trim();

  return {
    assetKey: normalizeSlug(
      body.assetKey || body.asset_key || existing.asset_key,
    ),
    title: String(body.title || existing.title || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    category: String(
      body.category || inferCategory(file, existing.category || "image"),
    ).trim(),
    usageType: String(
      body.usageType || body.usage_type || existing.usage_type || "general",
    ).trim(),
    altText: String(
      body.altText || body.alt_text || existing.alt_text || "",
    ).trim(),
    caption: String(body.caption || existing.caption || "").trim(),
    tags: parseJsonField(body.tags, existing.tags || []),
    fileUrl,
    fileName: file?.originalname || existing.file_name || "",
    storagePath: file
      ? path.join("uploads", "media", file.filename)
      : existing.storage_path || "",
    storageProvider: "local",
    mimeType: file?.mimetype || existing.mime_type || "",
    fileSize: file?.size || existing.file_size || 0,
    fileExtension: file
      ? path.extname(file.originalname).toLowerCase()
      : existing.file_extension || "",
    status: String(body.status || existing.status || "Draft").trim(),
    displayOrder: Number(
      body.displayOrder ?? body.display_order ?? existing.display_order ?? 0,
    ),
    isFeatured: isTruthy(
      body.isFeatured ?? body.is_featured ?? existing.is_featured ?? false,
    ),
    isActive: isTruthy(
      body.isActive ?? body.is_active ?? existing.is_active ?? true,
    ),
  };
}

router.get("/", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, asset_key, title, description, category, usage_type, alt_text, caption, tags,
              file_url, file_name, storage_path, storage_provider, mime_type, file_size,
              file_extension, status, display_order, is_featured, is_active, created_at, updated_at
       FROM media_assets
       WHERE is_active = TRUE AND status = 'Published'
       ORDER BY display_order ASC, title ASC`,
    );
    res.json({ success: true, data: rows.map(formatMedia) });
  } catch (error) {
    console.error("Media list error:", error);
    res.status(500).json({ success: false, message: "Failed to load media." });
  }
});

router.get("/admin", requireMediaAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, asset_key, title, description, category, usage_type, alt_text, caption, tags,
              file_url, file_name, storage_path, storage_provider, mime_type, file_size,
              file_extension, status, display_order, is_featured, is_active, created_at, updated_at
       FROM media_assets
       ORDER BY display_order ASC, title ASC`,
    );
    res.json({ success: true, data: rows.map(formatMedia) });
  } catch (error) {
    console.error("Media admin list error:", error);
    res.status(500).json({ success: false, message: "Failed to load media." });
  }
});

router.post(
  "/admin",
  requireMediaAdmin,
  upload.single("file"),
  async (req, res) => {
    const payload = buildMediaPayload(req.body, req.file);
    if (!payload.assetKey || !payload.title) {
      if (req.file) removeMediaFile(`/uploads/media/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        message: "assetKey and title are required.",
      });
    }

    if (!req.file && !payload.fileUrl) {
      return res.status(400).json({
        success: false,
        message: "A media file or fileUrl is required.",
      });
    }

    try {
      const { rows } = await query(
        `INSERT INTO media_assets (
          asset_key, title, description, category, usage_type, alt_text, caption, tags,
          file_url, file_name, storage_path, storage_provider, mime_type, file_size,
          file_extension, status, display_order, is_featured, is_active, updated_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
        )
        ON CONFLICT (asset_key) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          usage_type = EXCLUDED.usage_type,
          alt_text = EXCLUDED.alt_text,
          caption = EXCLUDED.caption,
          tags = EXCLUDED.tags,
          file_url = EXCLUDED.file_url,
          file_name = EXCLUDED.file_name,
          storage_path = EXCLUDED.storage_path,
          storage_provider = EXCLUDED.storage_provider,
          mime_type = EXCLUDED.mime_type,
          file_size = EXCLUDED.file_size,
          file_extension = EXCLUDED.file_extension,
          status = EXCLUDED.status,
          display_order = EXCLUDED.display_order,
          is_featured = EXCLUDED.is_featured,
          is_active = EXCLUDED.is_active,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *`,
        [
          payload.assetKey,
          payload.title,
          payload.description || null,
          payload.category || "image",
          payload.usageType || "general",
          payload.altText || null,
          payload.caption || null,
          jsonValue(payload.tags),
          payload.fileUrl,
          payload.fileName || null,
          payload.storagePath || null,
          payload.storageProvider || "local",
          payload.mimeType || null,
          payload.fileSize || 0,
          payload.fileExtension || null,
          payload.status || "Draft",
          payload.displayOrder,
          payload.isFeatured,
          payload.isActive,
          req.user.id,
        ],
      );

      res.status(201).json({ success: true, data: formatMedia(rows[0]) });
    } catch (error) {
      if (req.file) removeMediaFile(`/uploads/media/${req.file.filename}`);
      console.error("Media save error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to save media." });
    }
  },
);

router.put(
  "/admin/:id",
  requireMediaAdmin,
  upload.single("file"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!id) {
      if (req.file) removeMediaFile(`/uploads/media/${req.file.filename}`);
      return res
        .status(400)
        .json({ success: false, message: "Valid media id is required." });
    }

    const existingResult = await query(
      "SELECT * FROM media_assets WHERE id = $1 LIMIT 1",
      [id],
    );
    if (!existingResult.rows.length) {
      if (req.file) removeMediaFile(`/uploads/media/${req.file.filename}`);
      return res
        .status(404)
        .json({ success: false, message: "Media record not found." });
    }

    const existing = existingResult.rows[0];
    const payload = buildMediaPayload(req.body, req.file, existing);
    if (!payload.assetKey || !payload.title) {
      if (req.file) removeMediaFile(`/uploads/media/${req.file.filename}`);
      return res.status(400).json({
        success: false,
        message: "assetKey and title are required.",
      });
    }

    if (!req.file && !payload.fileUrl) {
      return res.status(400).json({
        success: false,
        message: "A media file or fileUrl is required.",
      });
    }

    try {
      const { rows } = await query(
        `UPDATE media_assets
         SET asset_key = $1,
             title = $2,
             description = $3,
             category = $4,
             usage_type = $5,
             alt_text = $6,
             caption = $7,
             tags = $8::jsonb,
             file_url = $9,
             file_name = $10,
             storage_path = $11,
             storage_provider = $12,
             mime_type = $13,
             file_size = $14,
             file_extension = $15,
             status = $16,
             display_order = $17,
             is_featured = $18,
             is_active = $19,
             updated_by = $20,
             updated_at = NOW()
         WHERE id = $21
         RETURNING *`,
        [
          payload.assetKey,
          payload.title,
          payload.description || null,
          payload.category || "image",
          payload.usageType || "general",
          payload.altText || null,
          payload.caption || null,
          jsonValue(payload.tags),
          payload.fileUrl,
          payload.fileName || null,
          payload.storagePath || null,
          payload.storageProvider || "local",
          payload.mimeType || null,
          payload.fileSize || 0,
          payload.fileExtension || null,
          payload.status || "Draft",
          payload.displayOrder,
          payload.isFeatured,
          payload.isActive,
          req.user.id,
          id,
        ],
      );

      if (
        req.file &&
        existing.file_url &&
        existing.file_url !== payload.fileUrl
      ) {
        removeMediaFile(existing.file_url);
      }

      res.json({ success: true, data: formatMedia(rows[0]) });
    } catch (error) {
      if (req.file) removeMediaFile(`/uploads/media/${req.file.filename}`);
      console.error("Media update error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to update media." });
    }
  },
);

router.delete("/admin/:id", requireMediaAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid media id is required." });
  }

  try {
    const existing = await query(
      "SELECT file_url FROM media_assets WHERE id = $1 LIMIT 1",
      [id],
    );
    if (!existing.rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Media record not found." });
    }

    await query("DELETE FROM media_assets WHERE id = $1", [id]);
    removeMediaFile(existing.rows[0].file_url);
    res.json({ success: true, message: "Media deleted." });
  } catch (error) {
    console.error("Media delete error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete media." });
  }
});

module.exports = router;
