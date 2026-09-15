/**
 * Program content for the public site and admin editing.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireProgramAdmin(req, res, next) {
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

function formatProgram(row, { listView = false } = {}) {
  const base = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    cardIcon: row.card_icon || "●",
    cardSummary: row.card_summary || row.summary,
    pageUrl: row.page_url || `${row.slug}.html`,
    ctaLabel: row.cta_label || "Learn more",
    ctaUrl: row.cta_url || row.page_url || `${row.slug}.html`,
    status: row.status || "Active",
    statusLabel: row.status_label || row.status || "Active",
    statusDetail: row.status_detail || "",
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.summary,
    displayOrder: Number(row.display_order || 0),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };

  if (listView) {
    return {
      ...base,
      heroStats: (row.hero_stats || []).slice(0, 3),
    };
  }

  return {
    ...base,
    bodyCopy: row.body_copy || [],
    heroStats: row.hero_stats || [],
    featureItems: row.feature_items || [],
    objectives: row.objectives || [],
    activities: row.activities || [],
    beneficiaries: row.beneficiaries || [],
    locations: row.locations || [],
    timeline: row.timeline || [],
    gallery: row.gallery || [],
    impactMetrics: row.impact_metrics || [],
    reports: row.reports || [],
    partners: row.partners || [],
  };
}

async function fetchPrograms(whereClause = "", params = []) {
  const sql = `
    SELECT
      id, slug, title, summary, description, body_copy, hero_image_url, hero_image_alt,
      card_icon, card_summary, page_url, cta_label, cta_url, status, status_label,
      status_detail, hero_stats, feature_items, objectives, activities, beneficiaries,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('url', g.image_url, 'alt', g.alt_text, 'caption', g.caption) ORDER BY g.display_order, g.id) FROM program_gallery g WHERE g.program_id = p.id), p.gallery) AS gallery,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('label', m.label, 'value', m.value, 'description', m.description, 'icon', m.icon, 'category', m.category) ORDER BY m.display_order, m.id) FROM program_impact_metrics m WHERE m.program_id = p.id), p.impact_metrics) AS impact_metrics,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('title', b.title, 'summary', b.description, 'imageUrl', b.image_url) ORDER BY b.display_order, b.id) FROM program_beneficiaries b WHERE b.program_id = p.id), p.beneficiaries) AS beneficiaries,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('title', l.name, 'summary', l.description, 'country', l.country, 'state', l.state, 'city', l.city) ORDER BY l.display_order, l.id) FROM program_locations l WHERE l.program_id = p.id), p.locations) AS locations,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('year', t.milestone_date, 'title', t.title, 'summary', t.description) ORDER BY t.display_order, t.id) FROM program_timeline t WHERE t.program_id = p.id), p.timeline) AS timeline,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('title', pr.title, 'url', pr.file_url, 'description', pr.description) ORDER BY pr.display_order, pr.id) FROM program_reports pr WHERE pr.program_id = p.id), p.reports) AS reports,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('title', partner.name, 'description', partner.description, 'logoUrl', partner.logo_url) ORDER BY pp.display_order, pp.id) FROM program_partners pp JOIN partners partner ON partner.id = pp.partner_id WHERE pp.program_id = p.id), p.partners) AS partners,
      seo_title, seo_description, display_order, is_featured, is_active, updated_by,
      created_at, updated_at
    FROM programs p
    ${whereClause}
    ORDER BY display_order ASC, title ASC
  `;
  const { rows } = await query(sql, params);
  return rows.map((row) => formatProgram(row));
}

function validateProgramPayload(body) {
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

function buildProgramPayload(body, existing = {}) {
  return {
    slug: normalizeSlug(body.slug || existing.slug),
    title: String(body.title || existing.title || "").trim(),
    summary: String(body.summary || existing.summary || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    bodyCopy: parseJsonField(
      body.bodyCopy || body.body_copy,
      existing.body_copy || [],
    ),
    heroImageUrl: String(
      body.heroImageUrl || body.hero_image_url || existing.hero_image_url || "",
    ).trim(),
    heroImageAlt: String(
      body.heroImageAlt || body.hero_image_alt || existing.hero_image_alt || "",
    ).trim(),
    cardIcon: String(
      body.cardIcon || body.card_icon || existing.card_icon || "●",
    ).trim(),
    cardSummary: String(
      body.cardSummary || body.card_summary || existing.card_summary || "",
    ).trim(),
    pageUrl: String(
      body.pageUrl || body.page_url || existing.page_url || "",
    ).trim(),
    ctaLabel: String(
      body.ctaLabel || body.cta_label || existing.cta_label || "",
    ).trim(),
    ctaUrl: String(
      body.ctaUrl || body.cta_url || existing.cta_url || "",
    ).trim(),
    status: String(body.status || existing.status || "Active").trim(),
    statusLabel: String(
      body.statusLabel || body.status_label || existing.status_label || "",
    ).trim(),
    statusDetail: String(
      body.statusDetail || body.status_detail || existing.status_detail || "",
    ).trim(),
    heroStats: parseJsonField(
      body.heroStats || body.hero_stats,
      existing.hero_stats || [],
    ),
    featureItems: parseJsonField(
      body.featureItems || body.feature_items,
      existing.feature_items || [],
    ),
    objectives: parseJsonField(body.objectives, existing.objectives || []),
    activities: parseJsonField(body.activities, existing.activities || []),
    beneficiaries: parseJsonField(
      body.beneficiaries,
      existing.beneficiaries || [],
    ),
    locations: parseJsonField(body.locations, existing.locations || []),
    timeline: parseJsonField(body.timeline, existing.timeline || []),
    gallery: parseJsonField(body.gallery, existing.gallery || []),
    impactMetrics: parseJsonField(
      body.impactMetrics || body.impact_metrics,
      existing.impact_metrics || [],
    ),
    stories: parseJsonField(body.stories, existing.stories || []),
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
    updatedBy: Number(body.updatedBy || body.updated_by || 0),
  };
}

router.get("/", async (_req, res) => {
  try {
    const programs = await fetchPrograms("WHERE is_active = TRUE");
    res.json({
      success: true,
      data: programs.map((program) => ({
        id: program.id,
        slug: program.slug,
        title: program.title,
        summary: program.summary,
        heroImageUrl: program.heroImageUrl,
        heroImageAlt: program.heroImageAlt,
        cardIcon: program.cardIcon,
        cardSummary: program.cardSummary,
        pageUrl: program.pageUrl,
        status: program.status,
        statusLabel: program.statusLabel,
        statusDetail: program.statusDetail,
        displayOrder: program.displayOrder,
        isFeatured: program.isFeatured,
      })),
    });
  } catch (error) {
    console.error("Programs list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load programs." });
  }
});

router.get("/admin", requireProgramAdmin, async (_req, res) => {
  try {
    const programs = await fetchPrograms();
    res.json({ success: true, data: programs });
  } catch (error) {
    console.error("Programs admin list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load programs." });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const programs = await fetchPrograms(
      "WHERE p.slug = $1 AND p.is_active = TRUE",
      [slug],
    );

    if (!programs.length) {
      return res
        .status(404)
        .json({ success: false, message: "Program not found." });
    }

    res.json({ success: true, data: programs[0] });
  } catch (error) {
    console.error("Program detail error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load program." });
  }
});

router.post("/admin", requireProgramAdmin, async (req, res) => {
  const validation = validateProgramPayload(req.body);
  if (!validation.valid) {
    return res
      .status(400)
      .json({ success: false, message: validation.message });
  }

  const payload = buildProgramPayload(req.body);
  try {
    const { rows } = await query(
      `INSERT INTO programs (
        slug, title, summary, description, body_copy, hero_image_url, hero_image_alt, card_icon,
        card_summary, page_url, cta_label, cta_url, status, status_label, status_detail, hero_stats,
        feature_items, objectives, activities, beneficiaries, locations, timeline, gallery,
        impact_metrics, stories, reports, partners, seo_title, seo_description, display_order,
        is_featured, is_active, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,
        $19::jsonb,$20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,$24::jsonb,$25::jsonb,$26::jsonb,
        $27::jsonb,$28,$29,$30,$31,$32,$33
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        body_copy = EXCLUDED.body_copy,
        hero_image_url = EXCLUDED.hero_image_url,
        hero_image_alt = EXCLUDED.hero_image_alt,
        card_icon = EXCLUDED.card_icon,
        card_summary = EXCLUDED.card_summary,
        page_url = EXCLUDED.page_url,
        cta_label = EXCLUDED.cta_label,
        cta_url = EXCLUDED.cta_url,
        status = EXCLUDED.status,
        status_label = EXCLUDED.status_label,
        status_detail = EXCLUDED.status_detail,
        hero_stats = EXCLUDED.hero_stats,
        feature_items = EXCLUDED.feature_items,
        objectives = EXCLUDED.objectives,
        activities = EXCLUDED.activities,
        beneficiaries = EXCLUDED.beneficiaries,
        locations = EXCLUDED.locations,
        timeline = EXCLUDED.timeline,
        gallery = EXCLUDED.gallery,
        impact_metrics = EXCLUDED.impact_metrics,
        stories = EXCLUDED.stories,
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
        jsonValue(payload.bodyCopy),
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        payload.cardIcon || "●",
        payload.cardSummary || null,
        payload.pageUrl || null,
        payload.ctaLabel || null,
        payload.ctaUrl || null,
        payload.status || "Active",
        payload.statusLabel || null,
        payload.statusDetail || null,
        jsonValue(payload.heroStats),
        jsonValue(payload.featureItems),
        jsonValue(payload.objectives),
        jsonValue(payload.activities),
        jsonValue(payload.beneficiaries),
        jsonValue(payload.locations),
        jsonValue(payload.timeline),
        jsonValue(payload.gallery),
        jsonValue(payload.impactMetrics),
        jsonValue(payload.stories),
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

    res.status(201).json({ success: true, data: formatProgram(rows[0]) });
  } catch (error) {
    console.error("Program save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save program." });
  }
});

router.put("/admin/:id", requireProgramAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Valid program id is required." });
  }

  const existingResult = await query(
    `SELECT * FROM programs WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!existingResult.rows.length) {
    return res
      .status(404)
      .json({ success: false, message: "Program not found." });
  }

  const existing = existingResult.rows[0];
  const payload = buildProgramPayload(req.body, existing);
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
      `UPDATE programs
       SET slug = $1,
           title = $2,
           summary = $3,
           description = $4,
           body_copy = $5::jsonb,
           hero_image_url = $6,
           hero_image_alt = $7,
           card_icon = $8,
           card_summary = $9,
           page_url = $10,
           cta_label = $11,
           cta_url = $12,
           status = $13,
           status_label = $14,
           status_detail = $15,
           hero_stats = $16::jsonb,
           feature_items = $17::jsonb,
           objectives = $18::jsonb,
           activities = $19::jsonb,
           beneficiaries = $20::jsonb,
           locations = $21::jsonb,
           timeline = $22::jsonb,
           gallery = $23::jsonb,
           impact_metrics = $24::jsonb,
           stories = $25::jsonb,
           reports = $26::jsonb,
           partners = $27::jsonb,
           seo_title = $28,
           seo_description = $29,
           display_order = $30,
           is_featured = $31,
           is_active = $32,
           updated_by = $33,
           updated_at = NOW()
       WHERE id = $34
       RETURNING *`,
      [
        payload.slug,
        payload.title,
        payload.summary,
        payload.description,
        jsonValue(payload.bodyCopy),
        payload.heroImageUrl || null,
        payload.heroImageAlt || null,
        payload.cardIcon || "●",
        payload.cardSummary || null,
        payload.pageUrl || null,
        payload.ctaLabel || null,
        payload.ctaUrl || null,
        payload.status || "Active",
        payload.statusLabel || null,
        payload.statusDetail || null,
        jsonValue(payload.heroStats),
        jsonValue(payload.featureItems),
        jsonValue(payload.objectives),
        jsonValue(payload.activities),
        jsonValue(payload.beneficiaries),
        jsonValue(payload.locations),
        jsonValue(payload.timeline),
        jsonValue(payload.gallery),
        jsonValue(payload.impactMetrics),
        jsonValue(payload.stories),
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

    res.json({ success: true, data: formatProgram(rows[0]) });
  } catch (error) {
    console.error("Program update error:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "That program slug is already in use. Choose a unique slug.",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update program." });
  }
});

const PROGRAM_CHILDREN = {
  beneficiaries: {
    table: "program_beneficiaries",
    columns: ["title", "description", "image_url", "display_order"],
    required: ["title"],
    map: (body) => ({
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim() || null,
      image_url: String(body.imageUrl || body.image_url || "").trim() || null,
      display_order: toNumber(body.displayOrder ?? body.display_order, 0),
    }),
  },
  locations: {
    table: "program_locations",
    columns: ["name", "description", "country", "state", "city", "display_order"],
    required: ["name"],
    map: (body) => ({
      name: String(body.name || body.title || "").trim(),
      description: String(body.description || body.summary || "").trim() || null,
      country: String(body.country || "").trim() || null,
      state: String(body.state || "").trim() || null,
      city: String(body.city || "").trim() || null,
      display_order: toNumber(body.displayOrder ?? body.display_order, 0),
    }),
  },
  timeline: {
    table: "program_timeline",
    columns: ["milestone_date", "title", "description", "display_order"],
    required: ["milestone_date", "title"],
    map: (body) => ({
      milestone_date: String(body.milestoneDate || body.year || "").trim(),
      title: String(body.title || "").trim(),
      description: String(body.description || body.summary || "").trim() || null,
      display_order: toNumber(body.displayOrder ?? body.display_order, 0),
    }),
  },
  gallery: {
    table: "program_gallery",
    columns: ["image_url", "alt_text", "caption", "display_order"],
    required: ["image_url"],
    map: (body) => ({
      image_url: String(body.imageUrl || body.url || body.image_url || "").trim(),
      alt_text: String(body.altText || body.alt || body.alt_text || "").trim() || null,
      caption: String(body.caption || "").trim() || null,
      display_order: toNumber(body.displayOrder ?? body.display_order, 0),
    }),
  },
  impactMetrics: {
    table: "program_impact_metrics",
    columns: ["label", "value", "description", "icon", "category", "display_order"],
    required: ["label", "value"],
    map: (body) => ({
      label: String(body.label || "").trim(),
      value: String(body.value ?? "").trim(),
      description: String(body.description || "").trim() || null,
      icon: String(body.icon || "").trim() || null,
      category: String(body.category || "").trim() || null,
      display_order: toNumber(body.displayOrder ?? body.display_order, 0),
    }),
  },
};

function childConfig(name) {
  return PROGRAM_CHILDREN[name] || null;
}

async function ensureProgram(programId) {
  const result = await query("SELECT id FROM programs WHERE id = $1 LIMIT 1", [programId]);
  return result.rows.length > 0;
}

function childRecord(row, name) {
  if (name === "beneficiaries") return { id: row.id, title: row.title, description: row.description || "", imageUrl: row.image_url || "", displayOrder: row.display_order };
  if (name === "locations") return { id: row.id, name: row.name, description: row.description || "", country: row.country || "", state: row.state || "", city: row.city || "", displayOrder: row.display_order };
  if (name === "timeline") return { id: row.id, milestoneDate: row.milestone_date, title: row.title, description: row.description || "", displayOrder: row.display_order };
  if (name === "gallery") return { id: row.id, imageUrl: row.image_url, altText: row.alt_text || "", caption: row.caption || "", displayOrder: row.display_order };
  return { id: row.id, label: row.label, value: row.value, description: row.description || "", icon: row.icon || "", category: row.category || "", displayOrder: row.display_order };
}

router.get("/admin/:programId/:collection", requireProgramAdmin, async (req, res) => {
  const programId = Number(req.params.programId);
  const config = childConfig(req.params.collection);
  if (!programId || !config) return res.status(400).json({ success: false, message: "Invalid program content collection." });
  try {
    if (!(await ensureProgram(programId))) return res.status(404).json({ success: false, message: "Program not found." });
    const { rows } = await query(`SELECT * FROM ${config.table} WHERE program_id = $1 ORDER BY display_order ASC, id ASC`, [programId]);
    res.json({ success: true, data: rows.map((row) => childRecord(row, req.params.collection)) });
  } catch (error) {
    console.error("Program child list error:", error);
    res.status(500).json({ success: false, message: "Failed to load program content." });
  }
});

router.post("/admin/:programId/:collection", requireProgramAdmin, async (req, res) => {
  const programId = Number(req.params.programId);
  const config = childConfig(req.params.collection);
  if (!programId || !config) return res.status(400).json({ success: false, message: "Invalid program content collection." });
  const values = config.map(req.body || {});
  if (config.required.some((field) => !values[field])) return res.status(400).json({ success: false, message: "Required program content fields are missing." });
  try {
    if (!(await ensureProgram(programId))) return res.status(404).json({ success: false, message: "Program not found." });
    const columns = ["program_id", ...config.columns];
    const params = [programId, ...config.columns.map((column) => values[column])];
    const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
    const { rows } = await query(`INSERT INTO ${config.table} (${columns.join(",")}) VALUES (${placeholders}) RETURNING *`, params);
    res.status(201).json({ success: true, data: childRecord(rows[0], req.params.collection) });
  } catch (error) {
    console.error("Program child create error:", error);
    res.status(500).json({ success: false, message: "Failed to add program content." });
  }
});

router.put("/admin/:programId/:collection/:id", requireProgramAdmin, async (req, res) => {
  const programId = Number(req.params.programId);
  const childId = Number(req.params.id);
  const config = childConfig(req.params.collection);
  if (!programId || !childId || !config) return res.status(400).json({ success: false, message: "Invalid program content record." });
  const values = config.map(req.body || {});
  if (config.required.some((field) => !values[field])) return res.status(400).json({ success: false, message: "Required program content fields are missing." });
  try {
    const assignments = config.columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
    const params = [...config.columns.map((column) => values[column]), programId, childId];
    const { rows } = await query(`UPDATE ${config.table} SET ${assignments}, updated_at = NOW() WHERE program_id = $${config.columns.length + 1} AND id = $${config.columns.length + 2} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ success: false, message: "Program content record not found." });
    res.json({ success: true, data: childRecord(rows[0], req.params.collection) });
  } catch (error) {
    console.error("Program child update error:", error);
    res.status(500).json({ success: false, message: "Failed to update program content." });
  }
});

router.delete("/admin/:programId/:collection/:id", requireProgramAdmin, async (req, res) => {
  const programId = Number(req.params.programId);
  const childId = Number(req.params.id);
  const config = childConfig(req.params.collection);
  if (!programId || !childId || !config) return res.status(400).json({ success: false, message: "Invalid program content record." });
  try {
    const result = await query(`DELETE FROM ${config.table} WHERE program_id = $1 AND id = $2`, [programId, childId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Program content record not found." });
    res.json({ success: true, message: "Program content removed." });
  } catch (error) {
    console.error("Program child delete error:", error);
    res.status(500).json({ success: false, message: "Failed to remove program content." });
  }
});

module.exports = router;
