/**
 * Reports/publications library for the public site and admin editing.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "content_manager",
  "finance_manager",
];

function requireReportAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    requireRole(...ADMIN_ROLES)(req, res, next),
  );
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return Boolean(value);
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseJsonField(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) || typeof parsed === "object"
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function jsonValue(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function formatReport(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description || "",
    category: row.category || "Publication",
    tags: Array.isArray(row.tags) ? row.tags : [],
    fileUrl: row.file_url,
    previewUrl: row.preview_url || row.file_url,
    fileType: row.file_type || "",
    publicationDate: row.publication_date || null,
    downloadCount: Number(row.download_count || 0),
    status: row.status || "Published",
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.summary,
    ogImageUrl: row.og_image_url || "",
    displayOrder: Number(row.display_order || 0),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    pageUrl: `report.html?slug=${encodeURIComponent(row.slug)}`,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function buildReportPayload(body, existing = {}) {
  return {
    slug: normalizeSlug(body.slug || existing.slug),
    title: String(body.title || existing.title || "").trim(),
    summary: String(body.summary || existing.summary || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    category: String(
      body.category || existing.category || "Publication",
    ).trim(),
    tags: parseJsonField(body.tags, existing.tags || []),
    fileUrl: String(
      body.fileUrl || body.file_url || existing.file_url || "",
    ).trim(),
    previewUrl: String(
      body.previewUrl || body.preview_url || existing.preview_url || "",
    ).trim(),
    fileType: String(
      body.fileType || body.file_type || existing.file_type || "",
    ).trim(),
    publicationDate:
      body.publicationDate ||
      body.publication_date ||
      existing.publication_date ||
      null,
    status: String(body.status || existing.status || "Published").trim(),
    seoTitle: String(
      body.seoTitle || body.seo_title || existing.seo_title || "",
    ).trim(),
    seoDescription: String(
      body.seoDescription ||
        body.seo_description ||
        existing.seo_description ||
        "",
    ).trim(),
    ogImageUrl: String(
      body.ogImageUrl || body.og_image_url || existing.og_image_url || "",
    ).trim(),
    displayOrder: toNumber(
      body.displayOrder || body.display_order,
      existing.display_order || 0,
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
      `SELECT id, slug, title, summary, description, category, tags, file_url, preview_url, file_type,
              publication_date, download_count, status, seo_title, seo_description, og_image_url,
              display_order, is_featured, is_active, updated_at, created_at
       FROM reports
       WHERE is_active = TRUE
       ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC`,
    );

    res.json({ success: true, data: rows.map(formatReport) });
  } catch (error) {
    console.error("Reports list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load reports." });
  }
});

router.get("/admin", requireReportAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, slug, title, summary, description, category, tags, file_url, preview_url, file_type,
              publication_date, download_count, status, seo_title, seo_description, og_image_url,
              display_order, is_featured, is_active, updated_by, updated_at, created_at
       FROM reports
       ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC`,
    );

    res.json({ success: true, data: rows.map(formatReport) });
  } catch (error) {
    console.error("Reports admin list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load reports." });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const { rows } = await query(
      `SELECT id, slug, title, summary, description, category, tags, file_url, preview_url, file_type,
              publication_date, download_count, status, seo_title, seo_description, og_image_url,
              display_order, is_featured, is_active, updated_by, updated_at, created_at
       FROM reports
       WHERE slug = $1 AND is_active = TRUE
       LIMIT 1`,
      [slug],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found." });
    }

    res.json({ success: true, data: formatReport(rows[0]) });
  } catch (error) {
    console.error("Report detail error:", error);
    res.status(500).json({ success: false, message: "Failed to load report." });
  }
});

router.post("/:slug/download", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const { rows } = await query(
      `UPDATE reports
       SET download_count = COALESCE(download_count, 0) + 1,
           updated_at = NOW()
       WHERE slug = $1 AND is_active = TRUE
       RETURNING file_url, download_count`,
      [slug],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found." });
    }

    res.json({
      success: true,
      fileUrl: rows[0].file_url,
      downloadCount: Number(rows[0].download_count || 0),
    });
  } catch (error) {
    console.error("Report download analytics error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to record download." });
  }
});

router.post("/admin", requireReportAdmin, async (req, res) => {
  const payload = buildReportPayload(req.body);
  if (!payload.slug || !payload.title || !payload.summary || !payload.fileUrl) {
    return res.status(400).json({
      success: false,
      message: "slug, title, summary, and fileUrl are required.",
    });
  }

  try {
    const { rows } = await query(
      `INSERT INTO reports (
        slug, title, summary, description, category, tags, file_url, preview_url, file_type,
        publication_date, download_count, status, seo_title, seo_description, og_image_url,
        display_order, is_featured, is_active, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,COALESCE($11,0),$12,$13,$14,$15,$16,$17,$18,$19
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        file_url = EXCLUDED.file_url,
        preview_url = EXCLUDED.preview_url,
        file_type = EXCLUDED.file_type,
        publication_date = EXCLUDED.publication_date,
        status = EXCLUDED.status,
        seo_title = EXCLUDED.seo_title,
        seo_description = EXCLUDED.seo_description,
        og_image_url = EXCLUDED.og_image_url,
        display_order = EXCLUDED.display_order,
        is_featured = EXCLUDED.is_featured,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *`,
      [
        payload.slug,
        payload.title,
        payload.summary,
        payload.description || null,
        payload.category || "Publication",
        jsonValue(payload.tags),
        payload.fileUrl,
        payload.previewUrl || payload.fileUrl,
        payload.fileType || null,
        payload.publicationDate || null,
        0,
        payload.status || "Published",
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.ogImageUrl || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatReport(rows[0]) });
  } catch (error) {
    console.error("Report save error:", error);
    res.status(500).json({ success: false, message: "Failed to save report." });
  }
});

router.put("/admin/:id", requireReportAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid report id is required." });
  }

  const existingResult = await query(
    `SELECT * FROM reports WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!existingResult.rows.length) {
    return res
      .status(404)
      .json({ success: false, message: "Report not found." });
  }

  const payload = buildReportPayload(req.body, existingResult.rows[0]);
  if (!payload.slug || !payload.title || !payload.summary || !payload.fileUrl) {
    return res.status(400).json({
      success: false,
      message: "slug, title, summary, and fileUrl are required.",
    });
  }

  try {
    const { rows } = await query(
      `UPDATE reports
       SET slug = $1,
           title = $2,
           summary = $3,
           description = $4,
           category = $5,
           tags = $6::jsonb,
           file_url = $7,
           preview_url = $8,
           file_type = $9,
           publication_date = $10,
           status = $11,
           seo_title = $12,
           seo_description = $13,
           og_image_url = $14,
           display_order = $15,
           is_featured = $16,
           is_active = $17,
           updated_by = $18,
           updated_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [
        payload.slug,
        payload.title,
        payload.summary,
        payload.description || null,
        payload.category || "Publication",
        jsonValue(payload.tags),
        payload.fileUrl,
        payload.previewUrl || payload.fileUrl,
        payload.fileType || null,
        payload.publicationDate || null,
        payload.status || "Published",
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.ogImageUrl || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
        id,
      ],
    );

    res.json({ success: true, data: formatReport(rows[0]) });
  } catch (error) {
    console.error("Report update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update report." });
  }
});

module.exports = router;
