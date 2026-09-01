/**
 * CMS pages for global site settings, homepage content, SEO, partners, and events.
 */

const express = require("express");

const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireCmsAdmin(req, res, next) {
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

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseJsonField(value, fallback = {}) {
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

function formatCmsPage(row) {
  return {
    id: row.id,
    pageKey: row.page_key,
    pageType: row.page_type,
    title: row.title,
    summary: row.summary || "",
    body: row.body || {},
    settings: row.settings || {},
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.summary || "",
    status: row.status || "Draft",
    displayOrder: Number(row.display_order || 0),
    isActive: Boolean(row.is_active),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function buildCmsPayload(body, existing = {}) {
  const pageKey = normalizeKey(
    body.pageKey || body.page_key || existing.page_key,
  );
  const pageType = String(
    body.pageType || body.page_type || existing.page_type || "page",
  ).trim();

  return {
    pageKey,
    pageType,
    title: String(body.title || existing.title || "").trim(),
    summary: String(body.summary || existing.summary || "").trim(),
    body: parseJsonField(body.body, existing.body || {}),
    settings: parseJsonField(body.settings, existing.settings || {}),
    heroImageUrl: String(
      body.heroImageUrl || body.hero_image_url || existing.hero_image_url || "",
    ).trim(),
    heroImageAlt: String(
      body.heroImageAlt || body.hero_image_alt || existing.hero_image_alt || "",
    ).trim(),
    seoTitle: String(
      body.seoTitle || body.seo_title || existing.seo_title || "",
    ).trim(),
    seoDescription: String(
      body.seoDescription ||
        body.seo_description ||
        existing.seo_description ||
        "",
    ).trim(),
    status: String(body.status || existing.status || "Draft").trim(),
    displayOrder: Number(
      body.displayOrder ?? body.display_order ?? existing.display_order ?? 0,
    ),
    isActive: isTruthy(
      body.isActive ?? body.is_active ?? existing.is_active ?? true,
    ),
  };
}

function pickPublishedMap(rows) {
  return rows.reduce((acc, row) => {
    if (!row.is_active) return acc;
    acc[row.page_key] = formatCmsPage(row);
    return acc;
  }, {});
}

function projectPublicCms(pages) {
  return {
    siteSettings: pages["site-settings"] || null,
    homepage: pages.homepage || null,
    hero: pages.hero || null,
    footer: pages.footer || null,
    seo: pages.seo || null,
    partners: pages.partners || null,
    events: pages.events || null,
  };
}

router.get("/", async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, page_key, page_type, title, summary, body, settings, hero_image_url,
              hero_image_alt, seo_title, seo_description, status, display_order, is_active,
              updated_by, updated_at, created_at
       FROM cms_pages
       WHERE is_active = TRUE AND status = 'Published'
       ORDER BY display_order ASC, title ASC`,
    );

    const pages = pickPublishedMap(rows);
    res.json({
      success: true,
      data: projectPublicCms(pages),
    });
  } catch (error) {
    console.error("CMS public fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load CMS content." });
  }
});

router.get("/admin", requireCmsAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, page_key, page_type, title, summary, body, settings, hero_image_url,
              hero_image_alt, seo_title, seo_description, status, display_order, is_active,
              updated_by, updated_at, created_at
       FROM cms_pages
       ORDER BY display_order ASC, title ASC`,
    );

    res.json({ success: true, data: rows.map(formatCmsPage) });
  } catch (error) {
    console.error("CMS admin fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load CMS records." });
  }
});

router.post("/admin", requireCmsAdmin, async (req, res) => {
  const payload = buildCmsPayload(req.body);
  if (!payload.pageKey || !payload.title) {
    return res.status(400).json({
      success: false,
      message: "pageKey and title are required.",
    });
  }

  try {
    const { rows } = await query(
      `INSERT INTO cms_pages (
        page_key, page_type, title, summary, body, settings, hero_image_url, hero_image_alt,
        seo_title, seo_description, status, display_order, is_active, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14
      )
      ON CONFLICT (page_key) DO UPDATE SET
        page_type = EXCLUDED.page_type,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        body = EXCLUDED.body,
        settings = EXCLUDED.settings,
        hero_image_url = EXCLUDED.hero_image_url,
        hero_image_alt = EXCLUDED.hero_image_alt,
        seo_title = EXCLUDED.seo_title,
        seo_description = EXCLUDED.seo_description,
        status = EXCLUDED.status,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *`,
      [
        payload.pageKey,
        payload.pageType || "page",
        payload.title,
        payload.summary || null,
        jsonValue(payload.body),
        jsonValue(payload.settings),
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.status || "Draft",
        payload.displayOrder,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatCmsPage(rows[0]) });
  } catch (error) {
    console.error("CMS save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save CMS record." });
  }
});

router.put("/admin/:id", requireCmsAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid CMS record id is required." });
  }

  const existingResult = await query(
    "SELECT * FROM cms_pages WHERE id = $1 LIMIT 1",
    [id],
  );
  if (!existingResult.rows.length) {
    return res
      .status(404)
      .json({ success: false, message: "CMS record not found." });
  }

  const payload = buildCmsPayload(req.body, existingResult.rows[0]);
  if (!payload.pageKey || !payload.title) {
    return res.status(400).json({
      success: false,
      message: "pageKey and title are required.",
    });
  }

  try {
    const { rows } = await query(
      `UPDATE cms_pages
       SET page_key = $1,
           page_type = $2,
           title = $3,
           summary = $4,
           body = $5::jsonb,
           settings = $6::jsonb,
           hero_image_url = $7,
           hero_image_alt = $8,
           seo_title = $9,
           seo_description = $10,
           status = $11,
           display_order = $12,
           is_active = $13,
           updated_by = $14,
           updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        payload.pageKey,
        payload.pageType || "page",
        payload.title,
        payload.summary || null,
        jsonValue(payload.body),
        jsonValue(payload.settings),
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.status || "Draft",
        payload.displayOrder,
        payload.isActive,
        req.user.id,
        id,
      ],
    );

    res.json({ success: true, data: formatCmsPage(rows[0]) });
  } catch (error) {
    console.error("CMS update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update CMS record." });
  }
});

module.exports = router;
