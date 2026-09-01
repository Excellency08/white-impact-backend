/**
 * Story editorial pages and admin editing.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireStoryAdmin(req, res, next) {
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

function formatStory(row, { listView = false } = {}) {
  const parsedContent = Array.isArray(row.content) ? row.content : [];
  const parsedTags = Array.isArray(row.tags) ? row.tags : [];
  const parsedImages = Array.isArray(row.images) ? row.images : [];
  const parsedGallery = Array.isArray(row.gallery) ? row.gallery : [];

  const base = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    authorName: row.author_name || "White Impact Team",
    authorRole: row.author_role || "",
    programSlug: row.program_slug || "",
    programTitle: row.program_title || "",
    location: row.location || "",
    tags: parsedTags,
    publicationDate: row.publication_date || null,
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.excerpt,
    displayOrder: Number(row.display_order || 0),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };

  if (listView) {
    return base;
  }

  return {
    ...base,
    content: parsedContent,
    images: parsedImages,
    gallery: parsedGallery,
  };
}

async function fetchStories(whereClause = "", params = []) {
  const sql = `
    SELECT
      s.id, s.slug, s.title, s.excerpt, s.content, s.hero_image_url, s.hero_image_alt,
      s.images, s.gallery, s.author_name, s.author_role, s.program_slug, p.title AS program_title,
      s.location, s.tags, s.publication_date, s.seo_title, s.seo_description, s.display_order,
      s.is_featured, s.is_active, s.updated_by, s.created_at, s.updated_at
    FROM stories s
    LEFT JOIN programs p ON p.slug = s.program_slug
    ${whereClause}
    ORDER BY s.display_order ASC, s.publication_date DESC NULLS LAST, s.title ASC
  `;
  const { rows } = await query(sql, params);
  return rows.map((row) => formatStory(row));
}

function validateStoryPayload(body) {
  const slug = normalizeSlug(body.slug);
  const title = String(body.title || "").trim();
  const excerpt = String(body.excerpt || "").trim();
  const authorName = String(body.authorName || body.author_name || "").trim();
  const content = parseJsonField(body.content, []);

  if (!slug) return { valid: false, message: "slug is required." };
  if (!title) return { valid: false, message: "title is required." };
  if (!excerpt) return { valid: false, message: "excerpt is required." };
  if (!authorName) return { valid: false, message: "authorName is required." };
  if (!content.length) return { valid: false, message: "content is required." };

  return { valid: true, slug, title, excerpt, authorName, content };
}

function buildStoryPayload(body, existing = {}) {
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
    images: parseJsonField(body.images, existing.images || []),
    gallery: parseJsonField(body.gallery, existing.gallery || []),
    authorName: String(
      body.authorName || body.author_name || existing.author_name || "",
    ).trim(),
    authorRole: String(
      body.authorRole || body.author_role || existing.author_role || "",
    ).trim(),
    programSlug: normalizeSlug(
      body.programSlug || body.program_slug || existing.program_slug || "",
    ),
    location: String(body.location || existing.location || "").trim(),
    tags: parseJsonField(body.tags, existing.tags || []),
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
    const stories = await fetchStories("WHERE s.is_active = TRUE");
    res.json({
      success: true,
      data: stories.map((story) => ({
        ...story,
        content: undefined,
        images: undefined,
        gallery: undefined,
      })),
    });
  } catch (error) {
    console.error("Stories list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load stories." });
  }
});

router.get("/admin", requireStoryAdmin, async (_req, res) => {
  try {
    const stories = await fetchStories();
    res.json({ success: true, data: stories });
  } catch (error) {
    console.error("Stories admin list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load stories." });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const { rows } = await query(
      `SELECT
        s.id, s.slug, s.title, s.excerpt, s.content, s.hero_image_url, s.hero_image_alt,
        s.images, s.gallery, s.author_name, s.author_role, s.program_slug, p.title AS program_title,
        s.location, s.tags, s.publication_date, s.seo_title, s.seo_description, s.display_order,
        s.is_featured, s.is_active, s.updated_by, s.created_at, s.updated_at
       FROM stories s
       LEFT JOIN programs p ON p.slug = s.program_slug
       WHERE s.slug = $1 AND s.is_active = TRUE
       LIMIT 1`,
      [slug],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found." });
    }

    res.json({ success: true, data: formatStory(rows[0]) });
  } catch (error) {
    console.error("Story detail error:", error);
    res.status(500).json({ success: false, message: "Failed to load story." });
  }
});

router.post("/admin", requireStoryAdmin, async (req, res) => {
  const validation = validateStoryPayload(req.body);
  if (!validation.valid) {
    return res
      .status(400)
      .json({ success: false, message: validation.message });
  }

  const payload = buildStoryPayload(req.body);
  try {
    const { rows } = await query(
      `INSERT INTO stories (
        slug, title, excerpt, content, hero_image_url, hero_image_alt, images, gallery,
        author_name, author_role, program_slug, location, tags, publication_date, seo_title,
        seo_description, display_order, is_featured, is_active, updated_by
      ) VALUES (
        $1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9,$10,NULLIF($11, ''),$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        excerpt = EXCLUDED.excerpt,
        content = EXCLUDED.content,
        hero_image_url = EXCLUDED.hero_image_url,
        hero_image_alt = EXCLUDED.hero_image_alt,
        images = EXCLUDED.images,
        gallery = EXCLUDED.gallery,
        author_name = EXCLUDED.author_name,
        author_role = EXCLUDED.author_role,
        program_slug = EXCLUDED.program_slug,
        location = EXCLUDED.location,
        tags = EXCLUDED.tags,
        publication_date = EXCLUDED.publication_date,
        seo_title = EXCLUDED.seo_title,
        seo_description = EXCLUDED.seo_description,
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
        jsonValue(payload.images),
        jsonValue(payload.gallery),
        payload.authorName,
        payload.authorRole || null,
        payload.programSlug || null,
        payload.location || null,
        jsonValue(payload.tags),
        payload.publicationDate || null,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatStory(rows[0]) });
  } catch (error) {
    console.error("Story save error:", error);
    res.status(500).json({ success: false, message: "Failed to save story." });
  }
});

router.put("/admin/:id", requireStoryAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid story id is required." });
  }

  const existingResult = await query(
    `SELECT * FROM stories WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!existingResult.rows.length) {
    return res
      .status(404)
      .json({ success: false, message: "Story not found." });
  }

  const payload = buildStoryPayload(req.body, existingResult.rows[0]);
  if (
    !payload.slug ||
    !payload.title ||
    !payload.excerpt ||
    !payload.authorName ||
    !payload.content.length
  ) {
    return res.status(400).json({
      success: false,
      message: "slug, title, excerpt, authorName, and content are required.",
    });
  }

  try {
    const { rows } = await query(
      `UPDATE stories
       SET slug = $1,
           title = $2,
           excerpt = $3,
           content = $4::jsonb,
           hero_image_url = $5,
           hero_image_alt = $6,
           images = $7::jsonb,
           gallery = $8::jsonb,
           author_name = $9,
           author_role = $10,
           program_slug = NULLIF($11, ''),
           location = $12,
           tags = $13::jsonb,
           publication_date = $14,
           seo_title = $15,
           seo_description = $16,
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
        jsonValue(payload.images),
        jsonValue(payload.gallery),
        payload.authorName,
        payload.authorRole || null,
        payload.programSlug || null,
        payload.location || null,
        jsonValue(payload.tags),
        payload.publicationDate || null,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
        id,
      ],
    );

    res.json({ success: true, data: formatStory(rows[0]) });
  } catch (error) {
    console.error("Story update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update story." });
  }
});

module.exports = router;
