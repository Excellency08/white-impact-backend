/**
 * Global site search across programs, projects, stories, news, and reports.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");

function normalizeSearch(value) {
  return String(value || "").trim();
}

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function formatItem(row, type) {
  return {
    type,
    id: row.id,
    title: row.title,
    summary: row.summary || row.excerpt || row.description || "",
    slug: row.slug || "",
    url:
      row.page_url ||
      row.pageUrl ||
      row.url ||
      (type === "report"
        ? `report.html?slug=${encodeURIComponent(row.slug)}`
        : type === "story"
          ? `story.html?slug=${encodeURIComponent(row.slug)}`
          : type === "news"
            ? `news-article.html?slug=${encodeURIComponent(row.slug)}`
            : type === "project"
              ? `project.html?slug=${encodeURIComponent(row.slug)}`
              : type === "program"
                ? `${row.slug}.html`
                : "#"),
    category: row.category || "",
    status: row.status || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    updatedAt: row.updated_at || row.created_at || null,
  };
}

router.get("/", async (req, res) => {
  const q = normalizeSearch(req.query.q || req.query.query);
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  if (!q || q.length < 2) {
    return res.json({ success: true, data: [], query: q });
  }

  const pattern = likePattern(q);

  try {
    const [programs, projects, stories, news, reports] = await Promise.all([
      query(
        `SELECT id, slug, title, summary, status, updated_at
         FROM programs
         WHERE is_active = TRUE AND (title ILIKE $1 ESCAPE '\\' OR summary ILIKE $1 ESCAPE '\\')
         ORDER BY display_order ASC, title ASC
         LIMIT $2`,
        [pattern, limit],
      ),
      query(
        `SELECT id, slug, title, summary, status, updated_at
         FROM projects
         WHERE is_active = TRUE AND (title ILIKE $1 ESCAPE '\\' OR summary ILIKE $1 ESCAPE '\\')
         ORDER BY display_order ASC, title ASC
         LIMIT $2`,
        [pattern, limit],
      ),
      query(
        `SELECT id, slug, title, excerpt AS summary, author_name, author_role, program_slug, tags, updated_at
         FROM stories
         WHERE is_active = TRUE AND (title ILIKE $1 ESCAPE '\\' OR excerpt ILIKE $1 ESCAPE '\\')
         ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC
         LIMIT $2`,
        [pattern, limit],
      ),
      query(
        `SELECT id, slug, title, excerpt AS summary, category, status, tags, updated_at, created_at
         FROM news_posts
         WHERE is_active = TRUE AND (title ILIKE $1 ESCAPE '\\' OR excerpt ILIKE $1 ESCAPE '\\')
         ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC
         LIMIT $2`,
        [pattern, limit],
      ),
      query(
        `SELECT id, slug, title, summary, description, category, status, tags, updated_at, created_at
         FROM reports
         WHERE is_active = TRUE AND (title ILIKE $1 ESCAPE '\\' OR summary ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\')
         ORDER BY display_order ASC, publication_date DESC NULLS LAST, title ASC
         LIMIT $2`,
        [pattern, limit],
      ),
    ]);

    const data = [
      ...programs.rows.map((row) => formatItem(row, "program")),
      ...projects.rows.map((row) => formatItem(row, "project")),
      ...stories.rows.map((row) => formatItem(row, "story")),
      ...news.rows.map((row) => formatItem(row, "news")),
      ...reports.rows.map((row) => formatItem(row, "report")),
    ];

    res.json({
      success: true,
      query: q,
      data: data.slice(0, limit),
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ success: false, message: "Failed to search site content." });
  }
});

module.exports = router;
