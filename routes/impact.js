/**
 * Impact data for the homepage and admin editing.
 *
 * Public:
 *   GET /api/impact
 *
 * Admin:
 *   GET  /api/impact/admin
 *   POST /api/impact/admin/metrics
 *   PUT  /api/impact/admin/metrics/:id
 *   POST /api/impact/admin/metrics/:id/history
 *   GET  /api/impact/admin/history
 *   POST /api/impact/admin/program-outcomes
 *   PUT  /api/impact/admin/program-outcomes/:id
 *   POST /api/impact/admin/geographies
 *   PUT  /api/impact/admin/geographies/:id
 *   POST /api/impact/admin/stories
 *   PUT  /api/impact/admin/stories/:id
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

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

function normalizeMetricKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatMetric(row) {
  const value = Number(row.value ?? 0);
  const prefix = row.display_prefix || "";
  const suffix = row.display_suffix || "";
  const displayValue = `${prefix}${Math.round(value).toLocaleString()}${suffix}`;

  return {
    id: row.id,
    metricKey: row.metric_key,
    label: row.label,
    value,
    displayPrefix: prefix,
    displaySuffix: suffix,
    displayValue,
    description: row.description || "",
    category: row.category || "overview",
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    createdBy: row.updated_by || null,
  };
}

function formatHistoryRow(row) {
  return {
    id: row.id,
    metricId: row.metric_id,
    metricKey: row.metric_key,
    metricLabel: row.metric_label,
    value: Number(row.value ?? 0),
    recordedOn: row.recorded_on,
    note: row.note || "",
    createdAt: row.created_at,
  };
}

function formatProgramOutcome(row) {
  const value =
    row.metric_value === null || row.metric_value === undefined
      ? null
      : Number(row.metric_value);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    metricLabel: row.metric_label || "",
    metricValue: value,
    metricSuffix: row.metric_suffix || "",
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function formatGeography(row) {
  const value =
    row.beneficiary_value === null || row.beneficiary_value === undefined
      ? null
      : Number(row.beneficiary_value);

  return {
    id: row.id,
    slug: row.slug,
    locationName: row.location_name,
    region: row.region || "",
    summary: row.summary,
    beneficiaryLabel: row.beneficiary_label || "",
    beneficiaryValue: value,
    beneficiarySuffix: row.beneficiary_suffix || "",
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function formatStory(row) {
  return {
    id: row.id,
    slug: row.slug,
    headline: row.headline,
    summary: row.summary,
    sourceLabel: row.source_label || "",
    relatedProgramSlug: row.related_program_slug || "",
    relatedMetricKey: row.related_metric_key || "",
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

async function loadImpactDataset(includeInactive = false) {
  const filter = includeInactive ? "" : "WHERE is_active = TRUE";

  const [metricsRes, historyRes, outcomesRes, geographiesRes, storiesRes] =
    await Promise.all([
      query(
        `SELECT id, metric_key, label, value, display_prefix, display_suffix, description,
              category, sort_order, is_active, updated_by, created_at, updated_at
       FROM impact_metrics ${filter}
       ORDER BY category ASC, sort_order ASC, label ASC`,
      ),
      query(
        `SELECT h.id, h.metric_id, m.metric_key, m.label AS metric_label, h.value, h.recorded_on, h.note, h.created_at
       FROM impact_metric_history h
       JOIN impact_metrics m ON m.id = h.metric_id
       ORDER BY h.recorded_on DESC, h.created_at DESC
       LIMIT 100`,
      ),
      query(
        `SELECT id, slug, title, summary, metric_label, metric_value, metric_suffix,
              sort_order, is_active, updated_at, created_at
       FROM impact_program_outcomes ${filter}
       ORDER BY sort_order ASC, title ASC`,
      ),
      query(
        `SELECT id, slug, location_name, region, summary, beneficiary_label, beneficiary_value,
              beneficiary_suffix, sort_order, is_active, updated_at, created_at
       FROM impact_geographies ${filter}
       ORDER BY sort_order ASC, location_name ASC`,
      ),
      query(
        `SELECT id, slug, headline, summary, source_label, related_program_slug, related_metric_key,
              sort_order, is_active, updated_at, created_at
       FROM impact_stories ${filter}
       ORDER BY sort_order ASC, headline ASC`,
      ),
    ]);

  const metrics = metricsRes.rows.map(formatMetric);
  const chartSource = metrics.length
    ? Math.max(...metrics.map((metric) => Number(metric.value || 0)))
    : 0;

  const metricsWithBars = metrics.map((metric) => ({
    ...metric,
    chartPercent:
      chartSource > 0
        ? Math.max(8, Math.round((metric.value / chartSource) * 100))
        : 0,
  }));

  return {
    metrics: metricsWithBars,
    overviewMetrics: metricsWithBars.filter(
      (metric) => metric.category === "overview",
    ),
    chartMetrics: metricsWithBars.filter(
      (metric) => metric.category === "chart",
    ),
    history: historyRes.rows.map(formatHistoryRow),
    programOutcomes: outcomesRes.rows.map(formatProgramOutcome),
    geographies: geographiesRes.rows.map(formatGeography),
    stories: storiesRes.rows.map(formatStory),
    summary: {
      totalMetrics: metricsWithBars.length,
      activePrograms: outcomesRes.rows.length,
      activeGeographies: geographiesRes.rows.length,
      activeStories: storiesRes.rows.length,
      latestRecordedOn: historyRes.rows[0]?.recorded_on || null,
      updatedAt:
        metricsWithBars[0]?.updatedAt ||
        outcomesRes.rows[0]?.updated_at ||
        geographiesRes.rows[0]?.updated_at ||
        storiesRes.rows[0]?.updated_at ||
        null,
    },
  };
}

function requireImpactAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    requireRole(...ADMIN_ROLES)(req, res, next),
  );
}

function validateMetricPayload(body) {
  const metricKey = normalizeMetricKey(body.metricKey || body.metric_key);
  const label = String(body.label || "").trim();
  const value = body.value;

  if (!metricKey) return { valid: false, message: "metricKey is required." };
  if (!label) return { valid: false, message: "label is required." };
  if (value === undefined || value === null || value === "")
    return { valid: false, message: "value is required." };
  if (!Number.isFinite(Number(value)))
    return { valid: false, message: "value must be numeric." };

  return { valid: true, metricKey, label };
}

function validateTextPayload(body, requiredFields = []) {
  for (const field of requiredFields) {
    if (!String(body[field] || "").trim()) {
      return { valid: false, message: `${field} is required.` };
    }
  }
  return { valid: true };
}

router.get("/", async (_req, res) => {
  try {
    const data = await loadImpactDataset(false);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Impact fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load impact data." });
  }
});

router.get("/admin", requireImpactAdmin, async (_req, res) => {
  try {
    const data = await loadImpactDataset(true);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Impact admin fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load impact data." });
  }
});

router.get("/admin/history", requireImpactAdmin, async (req, res) => {
  try {
    const metricId = req.query.metricId ? Number(req.query.metricId) : null;
    const params = [];
    let where = "";

    if (metricId) {
      where = "WHERE h.metric_id = $1";
      params.push(metricId);
    }

    const { rows } = await query(
      `SELECT h.id, h.metric_id, m.metric_key, m.label AS metric_label, h.value, h.recorded_on, h.note, h.created_at
       FROM impact_metric_history h
       JOIN impact_metrics m ON m.id = h.metric_id
       ${where}
       ORDER BY h.recorded_on DESC, h.created_at DESC
       LIMIT 100`,
      params,
    );

    res.json({ success: true, data: rows.map(formatHistoryRow) });
  } catch (error) {
    console.error("Impact history fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load history." });
  }
});

router.post("/admin/history", requireImpactAdmin, async (req, res) => {
  const metricId = toNumber(req.body.metricId || req.body.metric_id, 0);
  const value = req.body.value;
  const recordedOn =
    req.body.recordedOn ||
    req.body.recorded_on ||
    new Date().toISOString().slice(0, 10);
  const note = String(req.body.note || "").trim() || null;

  if (!metricId) {
    return res
      .status(400)
      .json({ success: false, message: "metricId is required." });
  }
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return res
      .status(400)
      .json({ success: false, message: "value must be numeric." });
  }

  try {
    const { rows } = await query(
      `INSERT INTO impact_metric_history (metric_id, value, recorded_on, note, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, metric_id, value, recorded_on, note, created_at`,
      [metricId, Number(value), recordedOn, note, req.user.id],
    );

    const metric = await query(
      `SELECT metric_key, label FROM impact_metrics WHERE id = $1`,
      [metricId],
    );

    res.status(201).json({
      success: true,
      data: {
        ...formatHistoryRow({
          ...rows[0],
          metric_key: metric.rows[0]?.metric_key || "",
          metric_label: metric.rows[0]?.label || "",
        }),
      },
    });
  } catch (error) {
    console.error("Impact history create error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save history entry." });
  }
});

router.post("/admin/metrics", requireImpactAdmin, async (req, res) => {
  const validation = validateMetricPayload(req.body);
  if (!validation.valid) {
    return res
      .status(400)
      .json({ success: false, message: validation.message });
  }

  const payload = {
    metricKey: validation.metricKey,
    label: validation.label,
    value: Number(req.body.value),
    displayPrefix: String(
      req.body.displayPrefix || req.body.display_prefix || "",
    ).trim(),
    displaySuffix: String(
      req.body.displaySuffix || req.body.display_suffix || "",
    ).trim(),
    description: String(req.body.description || "").trim() || null,
    category:
      String(req.body.category || "overview")
        .trim()
        .toLowerCase() || "overview",
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  try {
    const { rows } = await query(
      `INSERT INTO impact_metrics (
        metric_key, label, value, display_prefix, display_suffix, description, category, sort_order, is_active, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (metric_key) DO UPDATE SET
        label = EXCLUDED.label,
        value = EXCLUDED.value,
        display_prefix = EXCLUDED.display_prefix,
        display_suffix = EXCLUDED.display_suffix,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING id, metric_key, label, value, display_prefix, display_suffix, description, category, sort_order, is_active, updated_by, created_at, updated_at`,
      [
        payload.metricKey,
        payload.label,
        payload.value,
        payload.displayPrefix,
        payload.displaySuffix,
        payload.description,
        payload.category,
        payload.sortOrder,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatMetric(rows[0]) });
  } catch (error) {
    console.error("Impact metric save error:", error);
    res.status(500).json({ success: false, message: "Failed to save metric." });
  }
});

router.put("/admin/metrics/:id", requireImpactAdmin, async (req, res) => {
  const metricId = Number(req.params.id);
  if (!metricId) {
    return res
      .status(400)
      .json({ success: false, message: "Valid metric id is required." });
  }

  const fields = {
    label: String(req.body.label || "").trim(),
    value: req.body.value,
    displayPrefix: String(
      req.body.displayPrefix || req.body.display_prefix || "",
    ).trim(),
    displaySuffix: String(
      req.body.displaySuffix || req.body.display_suffix || "",
    ).trim(),
    description: String(req.body.description || "").trim() || null,
    category:
      String(req.body.category || "overview")
        .trim()
        .toLowerCase() || "overview",
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  if (!fields.label) {
    return res
      .status(400)
      .json({ success: false, message: "label is required." });
  }
  if (
    fields.value === undefined ||
    fields.value === null ||
    fields.value === "" ||
    !Number.isFinite(Number(fields.value))
  ) {
    return res
      .status(400)
      .json({ success: false, message: "value must be numeric." });
  }

  try {
    const { rows, rowCount } = await query(
      `UPDATE impact_metrics
       SET label = $1,
           value = $2,
           display_prefix = $3,
           display_suffix = $4,
           description = $5,
           category = $6,
           sort_order = $7,
           is_active = $8,
           updated_by = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING id, metric_key, label, value, display_prefix, display_suffix, description, category, sort_order, is_active, updated_by, created_at, updated_at`,
      [
        fields.label,
        Number(fields.value),
        fields.displayPrefix,
        fields.displaySuffix,
        fields.description,
        fields.category,
        fields.sortOrder,
        fields.isActive,
        req.user.id,
        metricId,
      ],
    );

    if (!rowCount) {
      return res
        .status(404)
        .json({ success: false, message: "Metric not found." });
    }

    res.json({ success: true, data: formatMetric(rows[0]) });
  } catch (error) {
    console.error("Impact metric update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update metric." });
  }
});

router.post("/admin/program-outcomes", requireImpactAdmin, async (req, res) => {
  const validation = validateTextPayload(req.body, [
    "slug",
    "title",
    "summary",
  ]);
  if (!validation.valid) {
    return res
      .status(400)
      .json({ success: false, message: validation.message });
  }

  const payload = {
    slug: normalizeMetricKey(req.body.slug),
    title: String(req.body.title).trim(),
    summary: String(req.body.summary).trim(),
    metricLabel:
      String(req.body.metricLabel || req.body.metric_label || "").trim() ||
      null,
    metricValue: req.body.metricValue ?? req.body.metric_value ?? null,
    metricSuffix: String(
      req.body.metricSuffix || req.body.metric_suffix || "",
    ).trim(),
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  try {
    const { rows } = await query(
      `INSERT INTO impact_program_outcomes (
        slug, title, summary, metric_label, metric_value, metric_suffix, sort_order, is_active, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        metric_label = EXCLUDED.metric_label,
        metric_value = EXCLUDED.metric_value,
        metric_suffix = EXCLUDED.metric_suffix,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING id, slug, title, summary, metric_label, metric_value, metric_suffix, sort_order, is_active, updated_at, created_at`,
      [
        payload.slug,
        payload.title,
        payload.summary,
        payload.metricLabel,
        payload.metricValue === null || payload.metricValue === ""
          ? null
          : Number(payload.metricValue),
        payload.metricSuffix,
        payload.sortOrder,
        payload.isActive,
        req.user.id,
      ],
    );

    res
      .status(201)
      .json({ success: true, data: formatProgramOutcome(rows[0]) });
  } catch (error) {
    console.error("Impact program outcome save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save program outcome." });
  }
});

router.put(
  "/admin/program-outcomes/:id",
  requireImpactAdmin,
  async (req, res) => {
    const outcomeId = Number(req.params.id);
    if (!outcomeId) {
      return res
        .status(400)
        .json({ success: false, message: "Valid outcome id is required." });
    }

    const payload = {
      title: String(req.body.title || "").trim(),
      summary: String(req.body.summary || "").trim(),
      metricLabel:
        String(req.body.metricLabel || req.body.metric_label || "").trim() ||
        null,
      metricValue: req.body.metricValue ?? req.body.metric_value ?? null,
      metricSuffix: String(
        req.body.metricSuffix || req.body.metric_suffix || "",
      ).trim(),
      sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
      isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
    };

    if (!payload.title || !payload.summary) {
      return res
        .status(400)
        .json({ success: false, message: "title and summary are required." });
    }

    try {
      const { rows, rowCount } = await query(
        `UPDATE impact_program_outcomes
       SET title = $1,
           summary = $2,
           metric_label = $3,
           metric_value = $4,
           metric_suffix = $5,
           sort_order = $6,
           is_active = $7,
           updated_by = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING id, slug, title, summary, metric_label, metric_value, metric_suffix, sort_order, is_active, updated_at, created_at`,
        [
          payload.title,
          payload.summary,
          payload.metricLabel,
          payload.metricValue === null || payload.metricValue === ""
            ? null
            : Number(payload.metricValue),
          payload.metricSuffix,
          payload.sortOrder,
          payload.isActive,
          req.user.id,
          outcomeId,
        ],
      );

      if (!rowCount) {
        return res
          .status(404)
          .json({ success: false, message: "Program outcome not found." });
      }

      res.json({ success: true, data: formatProgramOutcome(rows[0]) });
    } catch (error) {
      console.error("Impact program outcome update error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to update program outcome." });
    }
  },
);

router.post("/admin/geographies", requireImpactAdmin, async (req, res) => {
  const slug = normalizeMetricKey(req.body.slug);
  const locationName = String(
    req.body.locationName || req.body.location_name || "",
  ).trim();
  const summary = String(req.body.summary || "").trim();
  if (!slug || !locationName || !summary) {
    return res.status(400).json({
      success: false,
      message: "slug, locationName, and summary are required.",
    });
  }

  const payload = {
    slug,
    locationName,
    region: String(req.body.region || "").trim() || null,
    summary,
    beneficiaryLabel:
      String(
        req.body.beneficiaryLabel || req.body.beneficiary_label || "",
      ).trim() || null,
    beneficiaryValue:
      req.body.beneficiaryValue ?? req.body.beneficiary_value ?? null,
    beneficiarySuffix: String(
      req.body.beneficiarySuffix || req.body.beneficiary_suffix || "",
    ).trim(),
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  try {
    const { rows } = await query(
      `INSERT INTO impact_geographies (
        slug, location_name, region, summary, beneficiary_label, beneficiary_value, beneficiary_suffix, sort_order, is_active, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (slug) DO UPDATE SET
        location_name = EXCLUDED.location_name,
        region = EXCLUDED.region,
        summary = EXCLUDED.summary,
        beneficiary_label = EXCLUDED.beneficiary_label,
        beneficiary_value = EXCLUDED.beneficiary_value,
        beneficiary_suffix = EXCLUDED.beneficiary_suffix,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING id, slug, location_name, region, summary, beneficiary_label, beneficiary_value, beneficiary_suffix, sort_order, is_active, updated_at, created_at`,
      [
        payload.slug,
        payload.locationName,
        payload.region,
        payload.summary,
        payload.beneficiaryLabel,
        payload.beneficiaryValue === null || payload.beneficiaryValue === ""
          ? null
          : Number(payload.beneficiaryValue),
        payload.beneficiarySuffix,
        payload.sortOrder,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatGeography(rows[0]) });
  } catch (error) {
    console.error("Impact geography save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save geography." });
  }
});

router.put("/admin/geographies/:id", requireImpactAdmin, async (req, res) => {
  const geographyId = Number(req.params.id);
  if (!geographyId) {
    return res
      .status(400)
      .json({ success: false, message: "Valid geography id is required." });
  }

  const payload = {
    locationName: String(
      req.body.locationName || req.body.location_name || "",
    ).trim(),
    region: String(req.body.region || "").trim() || null,
    summary: String(req.body.summary || "").trim(),
    beneficiaryLabel:
      String(
        req.body.beneficiaryLabel || req.body.beneficiary_label || "",
      ).trim() || null,
    beneficiaryValue:
      req.body.beneficiaryValue ?? req.body.beneficiary_value ?? null,
    beneficiarySuffix: String(
      req.body.beneficiarySuffix || req.body.beneficiary_suffix || "",
    ).trim(),
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  if (!payload.locationName || !payload.summary) {
    return res.status(400).json({
      success: false,
      message: "locationName and summary are required.",
    });
  }

  try {
    const { rows, rowCount } = await query(
      `UPDATE impact_geographies
       SET location_name = $1,
           region = $2,
           summary = $3,
           beneficiary_label = $4,
           beneficiary_value = $5,
           beneficiary_suffix = $6,
           sort_order = $7,
           is_active = $8,
           updated_by = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING id, slug, location_name, region, summary, beneficiary_label, beneficiary_value, beneficiary_suffix, sort_order, is_active, updated_at, created_at`,
      [
        payload.locationName,
        payload.region,
        payload.summary,
        payload.beneficiaryLabel,
        payload.beneficiaryValue === null || payload.beneficiaryValue === ""
          ? null
          : Number(payload.beneficiaryValue),
        payload.beneficiarySuffix,
        payload.sortOrder,
        payload.isActive,
        req.user.id,
        geographyId,
      ],
    );

    if (!rowCount) {
      return res
        .status(404)
        .json({ success: false, message: "Geography not found." });
    }

    res.json({ success: true, data: formatGeography(rows[0]) });
  } catch (error) {
    console.error("Impact geography update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update geography." });
  }
});

router.post("/admin/stories", requireImpactAdmin, async (req, res) => {
  const validation = validateTextPayload(req.body, [
    "slug",
    "headline",
    "summary",
  ]);
  if (!validation.valid) {
    return res
      .status(400)
      .json({ success: false, message: validation.message });
  }

  const payload = {
    slug: normalizeMetricKey(req.body.slug),
    headline: String(req.body.headline).trim(),
    summary: String(req.body.summary).trim(),
    sourceLabel:
      String(req.body.sourceLabel || req.body.source_label || "").trim() ||
      null,
    relatedProgramSlug: normalizeMetricKey(
      req.body.relatedProgramSlug || req.body.related_program_slug || "",
    ),
    relatedMetricKey: normalizeMetricKey(
      req.body.relatedMetricKey || req.body.related_metric_key || "",
    ),
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  try {
    const { rows } = await query(
      `INSERT INTO impact_stories (
        slug, headline, summary, source_label, related_program_slug, related_metric_key, sort_order, is_active, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (slug) DO UPDATE SET
        headline = EXCLUDED.headline,
        summary = EXCLUDED.summary,
        source_label = EXCLUDED.source_label,
        related_program_slug = EXCLUDED.related_program_slug,
        related_metric_key = EXCLUDED.related_metric_key,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING id, slug, headline, summary, source_label, related_program_slug, related_metric_key, sort_order, is_active, updated_at, created_at`,
      [
        payload.slug,
        payload.headline,
        payload.summary,
        payload.sourceLabel,
        payload.relatedProgramSlug || null,
        payload.relatedMetricKey || null,
        payload.sortOrder,
        payload.isActive,
        req.user.id,
      ],
    );

    res.status(201).json({ success: true, data: formatStory(rows[0]) });
  } catch (error) {
    console.error("Impact story save error:", error);
    res.status(500).json({ success: false, message: "Failed to save story." });
  }
});

router.put("/admin/stories/:id", requireImpactAdmin, async (req, res) => {
  const storyId = Number(req.params.id);
  if (!storyId) {
    return res
      .status(400)
      .json({ success: false, message: "Valid story id is required." });
  }

  const payload = {
    headline: String(req.body.headline || "").trim(),
    summary: String(req.body.summary || "").trim(),
    sourceLabel:
      String(req.body.sourceLabel || req.body.source_label || "").trim() ||
      null,
    relatedProgramSlug: normalizeMetricKey(
      req.body.relatedProgramSlug || req.body.related_program_slug || "",
    ),
    relatedMetricKey: normalizeMetricKey(
      req.body.relatedMetricKey || req.body.related_metric_key || "",
    ),
    sortOrder: toNumber(req.body.sortOrder || req.body.sort_order, 0),
    isActive: isTruthy(req.body.isActive ?? req.body.is_active ?? true),
  };

  if (!payload.headline || !payload.summary) {
    return res
      .status(400)
      .json({ success: false, message: "headline and summary are required." });
  }

  try {
    const { rows, rowCount } = await query(
      `UPDATE impact_stories
       SET headline = $1,
           summary = $2,
           source_label = $3,
           related_program_slug = $4,
           related_metric_key = $5,
           sort_order = $6,
           is_active = $7,
           updated_by = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING id, slug, headline, summary, source_label, related_program_slug, related_metric_key, sort_order, is_active, updated_at, created_at`,
      [
        payload.headline,
        payload.summary,
        payload.sourceLabel,
        payload.relatedProgramSlug || null,
        payload.relatedMetricKey || null,
        payload.sortOrder,
        payload.isActive,
        req.user.id,
        storyId,
      ],
    );

    if (!rowCount) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found." });
    }

    res.json({ success: true, data: formatStory(rows[0]) });
  } catch (error) {
    console.error("Impact story update error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update story." });
  }
});

module.exports = router;
