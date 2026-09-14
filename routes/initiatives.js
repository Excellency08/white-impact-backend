/* Unified program/project management without replacing the legacy tables. */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const TYPES = new Set(["program", "project"]);
const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => requireRole(...ADMIN_ROLES)(req, res, next));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function json(value) {
  return JSON.stringify(value === undefined || value === null ? [] : value);
}

function format(row, type) {
  const project = type === "project";
  return {
    id: `${type}:${row.id}`,
    sourceId: row.id,
    entityType: type,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    programSlug: project ? row.program_slug || "" : "",
    location: project ? row.location || "" : "",
    status: row.status || "Active",
    statusLabel: row.status_label || row.status || "Active",
    statusDetail: row.status_detail || "",
    cardSummary: row.card_summary || row.summary,
    cardIcon: row.card_icon || "●",
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    bodyCopy: row.body_copy || [],
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.summary,
    displayOrder: Number(row.display_order || 0),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    pageUrl: project
      ? `project.html?slug=${encodeURIComponent(row.slug)}`
      : row.page_url || `${row.slug}.html`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function list(activeOnly) {
  const where = activeOnly ? "WHERE is_active = TRUE" : "";
  const [programs, projects] = await Promise.all([
    query(`SELECT * FROM programs ${where}`),
    query(`SELECT * FROM projects ${where}`),
  ]);
  return [
    ...programs.rows.map((row) => format(row, "program")),
    ...projects.rows.map((row) => format(row, "project")),
  ].sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title));
}

function validate(body, type = body.entityType) {
  const entityType = String(type || "").toLowerCase();
  const values = {
    entityType,
    slug: slugify(body.slug),
    title: String(body.title || "").trim(),
    summary: String(body.summary || "").trim(),
    description: String(body.description || "").trim(),
  };
  if (!TYPES.has(entityType)) return { message: "entityType must be program or project." };
  if (!values.slug || !values.title || !values.summary || !values.description) {
    return { message: "slug, title, summary, and description are required." };
  }
  return { values };
}

function commonValues(body, userId) {
  return [
    slugify(body.slug),
    String(body.title || "").trim(),
    String(body.summary || "").trim(),
    String(body.description || "").trim(),
    String(body.status || "Active").trim(),
    String(body.statusLabel || "").trim() || null,
    String(body.statusDetail || "").trim() || null,
    String(body.cardSummary || "").trim() || null,
    String(body.cardIcon || "●").trim(),
    String(body.heroImageUrl || "").trim() || null,
    String(body.heroImageAlt || "").trim() || null,
    json(body.bodyCopy),
    String(body.seoTitle || "").trim() || null,
    String(body.seoDescription || "").trim() || null,
    Number(body.displayOrder || 0),
    truthy(body.isFeatured),
    body.isActive === undefined ? true : truthy(body.isActive),
    Number(userId),
  ];
}

const columns = "slug,title,summary,description,status,status_label,status_detail,card_summary,card_icon,hero_image_url,hero_image_alt,body_copy,seo_title,seo_description,display_order,is_featured,is_active,updated_by";
const setClause = "slug=$1,title=$2,summary=$3,description=$4,status=$5,status_label=$6,status_detail=$7,card_summary=$8,card_icon=$9,hero_image_url=$10,hero_image_alt=$11,body_copy=$12::jsonb,seo_title=$13,seo_description=$14,display_order=$15,is_featured=$16,is_active=$17,updated_by=$18,updated_at=NOW()";

router.get("/", async (_req, res) => {
  try {
    res.json({ success: true, data: await list(true) });
  } catch (error) {
    console.error("Initiatives list error:", error);
    res.status(500).json({ success: false, message: "Failed to load initiatives." });
  }
});

router.get("/admin", requireAdmin, async (_req, res) => {
  try {
    res.json({ success: true, data: await list(false) });
  } catch (error) {
    console.error("Initiatives admin list error:", error);
    res.status(500).json({ success: false, message: "Failed to load initiatives." });
  }
});

router.post("/admin", requireAdmin, async (req, res) => {
  const validation = validate(req.body);
  if (validation.message) return res.status(400).json({ success: false, message: validation.message });

  const { values } = validation;
  const type = values.entityType;
  const table = type === "project" ? "projects" : "programs";
  const base = commonValues(req.body, req.user.id);
  const params = type === "project"
    ? [...base, slugify(req.body.programSlug), String(req.body.location || "").trim() || null]
    : base;
  const insertColumns = type === "project" ? `${columns},program_slug,location` : columns;
  const placeholders = params.map((_, index) => `$${index + 1}`).join(",");

  try {
    const result = await query(`INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders}) RETURNING *`, params);
    res.status(201).json({ success: true, data: format(result.rows[0], type) });
  } catch (error) {
    console.error("Initiative save error:", error);
    res.status(500).json({ success: false, message: "Failed to save initiative." });
  }
});

router.put("/admin/:entityType/:id", requireAdmin, async (req, res) => {
  const type = String(req.params.entityType || "").toLowerCase();
  const id = Number(req.params.id);
  const validation = validate(req.body, type);
  if (!id || validation.message) {
    return res.status(400).json({ success: false, message: validation.message || "Valid initiative id is required." });
  }

  const table = type === "project" ? "projects" : "programs";
  const base = commonValues(req.body, req.user.id);
  const params = type === "project"
    ? [...base, slugify(req.body.programSlug), String(req.body.location || "").trim() || null, id]
    : [...base, id];
  const update = type === "project" ? `${setClause},program_slug=NULLIF($19,''),location=$20` : setClause;

  try {
    const result = await query(`UPDATE ${table} SET ${update} WHERE id=$${params.length} RETURNING *`, params);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Initiative not found." });
    res.json({ success: true, data: format(result.rows[0], type) });
  } catch (error) {
    console.error("Initiative update error:", error);
    res.status(500).json({ success: false, message: "Failed to update initiative." });
  }
});

module.exports = router;
