/**
 * Project management for the public site and admin editing.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireProjectAdmin(req, res, next) {
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

function formatProject(row, { listView = false } = {}) {
  const base = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    programSlug: row.program_slug || "",
    programTitle: row.program_title || "",
    location: row.location || "",
    status: row.status || "Active",
    statusLabel: row.status_label || row.status || "Active",
    statusDetail: row.status_detail || "",
    cardSummary: row.card_summary || row.summary,
    cardIcon: row.card_icon || "●",
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.summary,
    pageUrl: `project.html?slug=${encodeURIComponent(row.slug)}`,
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
    bodyCopy: row.body_copy || [],
    timeline: row.timeline || [],
    objectives: row.objectives || [],
    outcomes: row.outcomes || [],
    media: row.media || [],
    impactMetrics: row.impact_metrics || [],
    relatedStories: row.related_stories || [],
    reports: row.reports || [],
    partners: row.partners || [],
  };
}

async function fetchProjects(whereClause = "", params = []) {
  const sql = `
    SELECT
      pr.id, pr.slug, pr.title, pr.summary, pr.description, pr.program_slug, p.title AS program_title,
      pr.location, pr.status, pr.status_label, pr.status_detail, pr.card_summary, pr.card_icon,
      pr.hero_image_url, pr.hero_image_alt, pr.body_copy, pr.timeline, pr.objectives, pr.outcomes,
      pr.media, pr.impact_metrics, pr.related_stories, pr.reports, pr.partners, pr.seo_title,
      pr.seo_description, pr.display_order, pr.is_featured, pr.is_active, pr.updated_by,
      pr.created_at, pr.updated_at
    FROM projects pr
    LEFT JOIN programs p ON p.slug = pr.program_slug
    ${whereClause}
    ORDER BY pr.display_order ASC, pr.title ASC
  `;
  const { rows } = await query(sql, params);
  return rows.map((row) => formatProject(row));
}

function validateProjectPayload(body) {
  const slug = normalizeSlug(body.slug);
  const title = String(body.title || "").trim();
  const summary = String(body.summary || "").trim();
  const description = String(body.description || "").trim();

  if (!slug) return { valid: false, message: "slug is required." };
  if (!title) return { valid: false, message: "title is required." };
  if (!summary) return { valid: false, message: "summary is required." };
  if (!description)
    return { valid: false, message: "description is required." };

  return { valid: true, slug, title, summary, description };
}

function buildProjectPayload(body, existing = {}) {
  return {
    slug: normalizeSlug(body.slug || existing.slug),
    title: String(body.title || existing.title || "").trim(),
    summary: String(body.summary || existing.summary || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    programSlug: normalizeSlug(
      body.programSlug || body.program_slug || existing.program_slug || "",
    ),
    location: String(body.location || existing.location || "").trim(),
    status: String(body.status || existing.status || "Active").trim(),
    statusLabel: String(
      body.statusLabel || body.status_label || existing.status_label || "",
    ).trim(),
    statusDetail: String(
      body.statusDetail || body.status_detail || existing.status_detail || "",
    ).trim(),
    cardSummary: String(
      body.cardSummary || body.card_summary || existing.card_summary || "",
    ).trim(),
    cardIcon: String(
      body.cardIcon || body.card_icon || existing.card_icon || "●",
    ).trim(),
    heroImageUrl: String(
      body.heroImageUrl || body.hero_image_url || existing.hero_image_url || "",
    ).trim(),
    heroImageAlt: String(
      body.heroImageAlt || body.hero_image_alt || existing.hero_image_alt || "",
    ).trim(),
    bodyCopy: parseJsonField(
      body.bodyCopy || body.body_copy,
      existing.body_copy || [],
    ),
    timeline: parseJsonField(body.timeline, existing.timeline || []),
    objectives: parseJsonField(body.objectives, existing.objectives || []),
    outcomes: parseJsonField(body.outcomes, existing.outcomes || []),
    media: parseJsonField(body.media, existing.media || []),
    impactMetrics: parseJsonField(
      body.impactMetrics || body.impact_metrics,
      existing.impact_metrics || [],
    ),
    relatedStories: parseJsonField(
      body.relatedStories || body.related_stories,
      existing.related_stories || [],
    ),
    reports: parseJsonField(body.reports, existing.reports || []),
    partners: parseJsonField(body.partners, existing.partners || []),
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
    const projects = await fetchProjects("WHERE pr.is_active = TRUE");
    res.json({
      success: true,
      data: projects.map((project) => ({
        ...project,
        bodyCopy: undefined,
        timeline: undefined,
        objectives: undefined,
        outcomes: undefined,
        media: undefined,
        impactMetrics: undefined,
        relatedStories: undefined,
        reports: undefined,
        partners: undefined,
      })),
    });
  } catch (error) {
    console.error("Projects list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load projects." });
  }
});

router.get("/admin", requireProjectAdmin, async (_req, res) => {
  try {
    const projects = await fetchProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error("Projects admin list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load projects." });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const { rows } = await query(
      `SELECT
        pr.id, pr.slug, pr.title, pr.summary, pr.description, pr.program_slug, p.title AS program_title,
        pr.location, pr.status, pr.status_label, pr.status_detail, pr.card_summary, pr.card_icon,
        pr.hero_image_url, pr.hero_image_alt, pr.body_copy, pr.timeline, pr.objectives, pr.outcomes,
        pr.media, pr.impact_metrics, pr.related_stories, pr.reports, pr.partners, pr.seo_title,
        pr.seo_description, pr.display_order, pr.is_featured, pr.is_active, pr.updated_by,
        pr.created_at, pr.updated_at
       FROM projects pr
       LEFT JOIN programs p ON p.slug = pr.program_slug
       WHERE pr.slug = $1 AND pr.is_active = TRUE
       LIMIT 1`,
      [slug],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found." });
    }

    res.json({ success: true, data: formatProject(rows[0]) });
  } catch (error) {
    console.error("Project detail error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load project." });
  }
});

router.post("/admin", requireProjectAdmin, async (req, res) => {
  const validation = validateProjectPayload(req.body);
  if (!validation.valid) {
    return res
      .status(400)
      .json({ success: false, message: validation.message });
  }

  const payload = buildProjectPayload(req.body);
  try {
    const { rows } = await query(
      `INSERT INTO projects (
        slug, title, summary, description, program_slug, location, status, status_label,
        status_detail, card_summary, card_icon, hero_image_url, hero_image_alt, body_copy,
        timeline, objectives, outcomes, media, impact_metrics, related_stories, reports,
        partners, seo_title, seo_description, display_order, is_featured, is_active, updated_by
      ) VALUES (
        $1,$2,$3,$4,
        NULLIF($5, ''),
        $6,$7,$8,$9,$10,$11,$12,$13,
        $14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb,
        $22::jsonb,$23,$24,$25,$26,$27,$28
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        program_slug = EXCLUDED.program_slug,
        location = EXCLUDED.location,
        status = EXCLUDED.status,
        status_label = EXCLUDED.status_label,
        status_detail = EXCLUDED.status_detail,
        card_summary = EXCLUDED.card_summary,
        card_icon = EXCLUDED.card_icon,
        hero_image_url = EXCLUDED.hero_image_url,
        hero_image_alt = EXCLUDED.hero_image_alt,
        body_copy = EXCLUDED.body_copy,
        timeline = EXCLUDED.timeline,
        objectives = EXCLUDED.objectives,
        outcomes = EXCLUDED.outcomes,
        media = EXCLUDED.media,
        impact_metrics = EXCLUDED.impact_metrics,
        related_stories = EXCLUDED.related_stories,
        reports = EXCLUDED.reports,
        partners = EXCLUDED.partners,
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
        payload.summary,
        payload.description,
        payload.programSlug || null,
        payload.location || null,
        payload.status || "Active",
        payload.statusLabel || null,
        payload.statusDetail || null,
        payload.cardSummary || null,
        payload.cardIcon || "●",
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        jsonValue(payload.bodyCopy),
        jsonValue(payload.timeline),
        jsonValue(payload.objectives),
        jsonValue(payload.outcomes),
        jsonValue(payload.media),
        jsonValue(payload.impactMetrics),
        jsonValue(payload.relatedStories),
        jsonValue(payload.reports),
        jsonValue(payload.partners),
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatProject(rows[0]) });
  } catch (error) {
    console.error("Project save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save project." });
  }
});

router.put("/admin/:id", requireProjectAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid project id is required." });
  }

  const existingResult = await query(
    `SELECT * FROM projects WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!existingResult.rows.length) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found." });
  }

  const payload = buildProjectPayload(req.body, existingResult.rows[0]);
  if (
    !payload.slug ||
    !payload.title ||
    !payload.summary ||
    !payload.description
  ) {
    return res.status(400).json({
      success: false,
      message: "slug, title, summary, and description are required.",
    });
  }

  try {
    const { rows } = await query(
      `UPDATE projects
       SET slug = $1,
           title = $2,
           summary = $3,
           description = $4,
           program_slug = NULLIF($5, ''),
           location = $6,
           status = $7,
           status_label = $8,
           status_detail = $9,
           card_summary = $10,
           card_icon = $11,
           hero_image_url = $12,
           hero_image_alt = $13,
           body_copy = $14::jsonb,
           timeline = $15::jsonb,
           objectives = $16::jsonb,
           outcomes = $17::jsonb,
           media = $18::jsonb,
           impact_metrics = $19::jsonb,
           related_stories = $20::jsonb,
           reports = $21::jsonb,
           partners = $22::jsonb,
           seo_title = $23,
           seo_description = $24,
           display_order = $25,
           is_featured = $26,
           is_active = $27,
           updated_by = $28,
           updated_at = NOW()
       WHERE id = $29
       RETURNING *`,
      [
        payload.slug,
        payload.title,
        payload.summary,
        payload.description,
        payload.programSlug || null,
        payload.location || null,
        payload.status || "Active",
        payload.statusLabel || null,
        payload.statusDetail || null,
        payload.cardSummary || null,
        payload.cardIcon || "●",
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        jsonValue(payload.bodyCopy),
        jsonValue(payload.timeline),
        jsonValue(payload.objectives),
        jsonValue(payload.outcomes),
        jsonValue(payload.media),
        jsonValue(payload.impactMetrics),
        jsonValue(payload.relatedStories),
        jsonValue(payload.reports),
        jsonValue(payload.partners),
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.displayOrder,
        payload.isFeatured,
        payload.isActive,
        req.user.id,
        id,
      ],
    );

    res.json({ success: true, data: formatProject(rows[0]) });
  } catch (error) {
    console.error("Project update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update project." });
  }
});

module.exports = router;
