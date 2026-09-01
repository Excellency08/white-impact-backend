/**
 * Volunteer applications for White Impact community programs.
 */

const express = require("express");
const router = express.Router();
const { query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../middleware/audit");
const { validateVolunteerForm } = require("../middleware/validators");

const ADMIN_ROLES = ["super_admin", "admin", "content_manager"];

function requireVolunteerAdmin(req, res, next) {
  return requireAuth(req, res, () =>
    requireRole(...ADMIN_ROLES)(req, res, next),
  );
}

function normalizeList(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return Boolean(value);
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function formatVolunteer(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || "",
    location: row.location || "",
    availability: row.availability || "",
    experienceLevel: row.experience_level || "",
    skills: Array.isArray(row.skills) ? row.skills : [],
    interests: Array.isArray(row.interests) ? row.interests : [],
    motivation: row.motivation || "",
    portfolioUrl: row.portfolio_url || "",
    sourcePage: row.source_page || "work-with-us",
    status: row.status || "pending",
    notes: row.notes || "",
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildPayload(body, existing = {}) {
  return {
    fullName: String(body.fullName || body.full_name || existing.full_name || "").trim(),
    email: String(body.email || existing.email || "").trim().toLowerCase(),
    phone: String(body.phone || existing.phone || "").trim(),
    location: String(body.location || existing.location || "").trim(),
    availability: String(body.availability || existing.availability || "").trim(),
    experienceLevel: String(
      body.experienceLevel || body.experience_level || existing.experience_level || "",
    ).trim(),
    skills: normalizeList(body.skills, existing.skills || []),
    interests: normalizeList(body.interests, existing.interests || []),
    motivation: String(body.motivation || existing.motivation || "").trim(),
    portfolioUrl: String(body.portfolioUrl || body.portfolio_url || existing.portfolio_url || "").trim(),
    sourcePage: String(body.sourcePage || body.source_page || existing.source_page || "work-with-us").trim(),
    status: String(body.status || existing.status || "pending").trim(),
    notes: String(body.notes || existing.notes || "").trim(),
  };
}

router.post("/", async (req, res) => {
  const payload = buildPayload(req.body);
  const validation = validateVolunteerForm(payload);
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  try {
    const { rows } = await query(
      `INSERT INTO volunteer_applications (
        full_name, email, phone, location, availability, experience_level,
        skills, interests, motivation, portfolio_url, source_page, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12
      ) RETURNING *`,
      [
        payload.fullName,
        payload.email,
        payload.phone || null,
        payload.location || null,
        payload.availability || null,
        payload.experienceLevel || null,
        JSON.stringify(payload.skills || []),
        JSON.stringify(payload.interests || []),
        payload.motivation || null,
        payload.portfolioUrl || null,
        payload.sourcePage || "work-with-us",
        payload.status || "pending",
      ],
    );

    const volunteer = rows[0];
    sendEmail({
      to: payload.email,
      subject: "We received your volunteer application",
      html: `<p>Thanks ${payload.fullName}, we received your volunteer application and will review it shortly.</p>`,
    }).catch(console.error);

    sendEmail({
      to: process.env.STAFF_EMAIL || "info@whiteimpactinitiative.org",
      subject: `New volunteer application — ${payload.fullName}`,
      html: `<p><strong>Name:</strong> ${payload.fullName}</p><p><strong>Email:</strong> ${payload.email}</p><p><strong>Availability:</strong> ${payload.availability || "—"}</p><p><strong>Experience:</strong> ${payload.experienceLevel || "—"}</p>`,
    }).catch(console.error);

    await logAudit({
      action: "volunteer.create",
      entityType: "volunteer_applications",
      entityId: volunteer.id,
      summary: `Volunteer application received for ${payload.fullName}`,
      metadata: { sourcePage: payload.sourcePage },
      req,
    });

    res.status(201).json({ success: true, data: formatVolunteer(volunteer) });
  } catch (error) {
    console.error("Volunteer create error:", error);
    res.status(500).json({ success: false, message: "Failed to save volunteer application." });
  }
});

router.get("/admin", requireVolunteerAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM volunteer_applications ORDER BY created_at DESC`,
    );
    res.json({ success: true, data: rows.map(formatVolunteer) });
  } catch (error) {
    console.error("Volunteer admin list error:", error);
    res.status(500).json({ success: false, message: "Failed to load volunteer applications." });
  }
});

router.put("/admin/:id", requireVolunteerAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "Valid volunteer id is required." });
  }

  try {
    const existingResult = await query("SELECT * FROM volunteer_applications WHERE id = $1 LIMIT 1", [id]);
    if (!existingResult.rows.length) {
      return res.status(404).json({ success: false, message: "Volunteer application not found." });
    }

    const existing = existingResult.rows[0];
    const payload = buildPayload(req.body, existing);
    const { rows } = await query(
      `UPDATE volunteer_applications
       SET full_name = $1,
           email = $2,
           phone = $3,
           location = $4,
           availability = $5,
           experience_level = $6,
           skills = $7::jsonb,
           interests = $8::jsonb,
           motivation = $9,
           portfolio_url = $10,
           source_page = $11,
           status = $12,
           notes = $13,
           reviewed_by = $14,
           reviewed_at = CASE WHEN $12 IN ('approved', 'rejected', 'reviewed') THEN NOW() ELSE reviewed_at END,
           updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        payload.fullName,
        payload.email,
        payload.phone || null,
        payload.location || null,
        payload.availability || null,
        payload.experienceLevel || null,
        JSON.stringify(payload.skills || []),
        JSON.stringify(payload.interests || []),
        payload.motivation || null,
        payload.portfolioUrl || null,
        payload.sourcePage || "work-with-us",
        payload.status || "pending",
        req.user.id,
        id,
      ],
    );

    await logAudit({
      actor: req.user,
      action: "volunteer.update",
      entityType: "volunteer_applications",
      entityId: id,
      summary: `Volunteer application ${id} updated`,
      metadata: { status: payload.status },
      req,
    });

    res.json({ success: true, data: formatVolunteer(rows[0]) });
  } catch (error) {
    console.error("Volunteer update error:", error);
    res.status(500).json({ success: false, message: "Failed to update volunteer application." });
  }
});

router.delete("/admin/:id", requireVolunteerAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "Valid volunteer id is required." });
  }

  try {
    const existing = await query("SELECT full_name FROM volunteer_applications WHERE id = $1 LIMIT 1", [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: "Volunteer application not found." });
    }

    await query("DELETE FROM volunteer_applications WHERE id = $1", [id]);
    await logAudit({
      actor: req.user,
      action: "volunteer.delete",
      entityType: "volunteer_applications",
      entityId: id,
      summary: `Volunteer application ${id} deleted`,
      req,
    });

    res.json({ success: true, message: "Volunteer application deleted." });
  } catch (error) {
    console.error("Volunteer delete error:", error);
    res.status(500).json({ success: false, message: "Failed to delete volunteer application." });
  }
});

module.exports = router;
