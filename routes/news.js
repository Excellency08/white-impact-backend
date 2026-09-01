/**
 * News posts for the public site and admin editing.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireNewsAdmin(req, res, next) {
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

function formatNews(row, { listView = false } = {}) {
  const base = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    authorName: row.author_name || "White Impact Team",
    authorRole: row.author_role || "",
    category: row.category || "News",
    tags: Array.isArray(row.tags) ? row.tags : [],
    relatedArticles: Array.isArray(row.related_articles)
      ? row.related_articles
      : [],
    status: row.status || "Draft",
    publicationDate: row.publication_date || null,
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.excerpt,
    ogImageUrl: row.og_image_url || row.hero_image_url || "",
    displayOrder: Number(row.display_order || 0),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    pageUrl: `news-article.html?slug=${encodeURIComponent(row.slug)}`,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };

  if (listView) {
    return base;
  }

  return {
    ...base,
    content: Array.isArray(row.content) ? row.content : [],
  };
}

function buildNewsPayload(body, existing = {}) {
  return {
    slug: normalizeSlug(body.slug || existing.slug),
    title: String(body.title || existing.title || "").trim(),
    excerpt: String(body.excerpt || existing.excerpt || "").trim(),
    content: parseJsonField(body.content, existing.content || []),
    heroImageUrl: String(
      body.heroImageUrl || body.hero_image_url || existing.hero_image_url || "",
    ).trim(),
    heroImageAlt: String(
      body.heroImageAlt || body.hero_image_alt || existing.hero_image_alt || "",
    ).trim(),
    authorName: String(
      body.authorName || body.author_name || existing.author_name || "",
    ).trim(),
    authorRole: String(
      body.authorRole || body.author_role || existing.author_role || "",
    ).trim(),
    category: String(body.category || existing.category || "News").trim(),
    tags: parseJsonField(body.tags, existing.tags || []),
    relatedArticles: parseJsonField(
      body.relatedArticles || body.related_articles,
      existing.related_articles || [],
    ),
    status: String(body.status || existing.status || "Draft").trim(),
    publicationDate:
      body.publicationDate ||
      body.publication_date ||
      existing.publication_date ||
      null,
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
      `SELECT id, slug, title, excerpt, hero_image_url, hero_image_alt, author_name, author_role,
              category, tags, related_articles, status, publication_date, seo_title, seo_description,
              og_image_url, display_order, is_featured, is_active, updated_at, created_at
       FROM news_posts
       WHERE is_active = TRUE
       ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC`,
    );

    res.json({
      success: true,
      data: rows.map((row) => formatNews(row, { listView: true })),
    });
  } catch (error) {
    console.error("News list error:", error);
    res.status(500).json({ success: false, message: "Failed to load news." });
  }
});

router.get("/admin", requireNewsAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, slug, title, excerpt, content, hero_image_url, hero_image_alt, author_name, author_role,
              category, tags, related_articles, status, publication_date, seo_title, seo_description,
              og_image_url, display_order, is_featured, is_active, updated_by, updated_at, created_at
       FROM news_posts
       ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC`,
    );

    res.json({ success: true, data: rows.map((row) => formatNews(row)) });
  } catch (error) {
    console.error("News admin list error:", error);
    res.status(500).json({ success: false, message: "Failed to load news." });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const { rows } = await query(
      `SELECT id, slug, title, excerpt, content, hero_image_url, hero_image_alt, author_name, author_role,
              category, tags, related_articles, status, publication_date, seo_title, seo_description,
              og_image_url, display_order, is_featured, is_active, updated_by, updated_at, created_at
       FROM news_posts
       WHERE slug = $1 AND is_active = TRUE
       LIMIT 1`,
      [slug],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "News post not found." });
    }

    res.json({ success: true, data: formatNews(rows[0]) });
  } catch (error) {
    console.error("News detail error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load news post." });
  }
});

router.post("/admin", requireNewsAdmin, async (req, res) => {
  const payload = buildNewsPayload(req.body);
  if (
    !payload.slug ||
    !payload.title ||
    !payload.excerpt ||
    !payload.authorName
  ) {
    return res.status(400).json({
      success: false,
      message: "slug, title, excerpt, and authorName are required.",
    });
  }

  try {
    const { rows } = await query(
      `INSERT INTO news_posts (
        slug, title, excerpt, content, hero_image_url, hero_image_alt, author_name, author_role,
        category, tags, related_articles, status, publication_date, seo_title, seo_description,
        og_image_url, display_order, is_featured, is_active, updated_by
      ) VALUES (
        $1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        excerpt = EXCLUDED.excerpt,
        content = EXCLUDED.content,
        hero_image_url = EXCLUDED.hero_image_url,
        hero_image_alt = EXCLUDED.hero_image_alt,
        author_name = EXCLUDED.author_name,
        author_role = EXCLUDED.author_role,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        related_articles = EXCLUDED.related_articles,
        status = EXCLUDED.status,
        publication_date = EXCLUDED.publication_date,
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
        payload.excerpt,
        jsonValue(payload.content),
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        payload.authorName,
        payload.authorRole || null,
        payload.category || "News",
        jsonValue(payload.tags),
        jsonValue(payload.relatedArticles),
        payload.status || "Draft",
        payload.publicationDate || null,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.ogImageUrl || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatNews(rows[0]) });
  } catch (error) {
    console.error("News save error:", error);
    res.status(500).json({ success: false, message: "Failed to save news." });
  }
});

router.put("/admin/:id", requireNewsAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid news id is required." });
  }

  const existingResult = await query(
    `SELECT * FROM news_posts WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!existingResult.rows.length) {
    return res
      .status(404)
      .json({ success: false, message: "News post not found." });
  }

  const payload = buildNewsPayload(req.body, existingResult.rows[0]);
  if (
    !payload.slug ||
    !payload.title ||
    !payload.excerpt ||
    !payload.authorName
  ) {
    return res.status(400).json({
      success: false,
      message: "slug, title, excerpt, and authorName are required.",
    });
  }

  try {
    const { rows } = await query(
      `UPDATE news_posts
       SET slug = $1,
           title = $2,
           excerpt = $3,
           content = $4::jsonb,
           hero_image_url = $5,
           hero_image_alt = $6,
           author_name = $7,
           author_role = $8,
           category = $9,
           tags = $10::jsonb,
           related_articles = $11::jsonb,
           status = $12,
           publication_date = $13,
           seo_title = $14,
           seo_description = $15,
           og_image_url = $16,
           display_order = $17,
           is_featured = $18,
           is_active = $19,
           updated_by = $20,
           updated_at = NOW()
       WHERE id = $21
       RETURNING *`,
      [
        payload.slug,
        payload.title,
        payload.excerpt,
        jsonValue(payload.content),
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        payload.authorName,
        payload.authorRole || null,
        payload.category || "News",
        jsonValue(payload.tags),
        jsonValue(payload.relatedArticles),
        payload.status || "Draft",
        payload.publicationDate || null,
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

    res.json({ success: true, data: formatNews(rows[0]) });
  } catch (error) {
    console.error("News update error:", error);
    res.status(500).json({ success: false, message: "Failed to update news." });
  }
});

module.exports = router;
