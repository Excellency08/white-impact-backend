/*
 * Phase 12 one-time, restart-safe Program image migration.
 *
 * This script uploads verified local image sources before changing any
 * database references. Legacy files and URLs are never deleted.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const FRONTEND_ROOT = path.resolve(__dirname, "../../white-impact-frontend");
const IMAGE_PATH = /^\.\/?assets\/images\/([^"']+?\.(?:jpe?g|png|webp|gif))$/i;
const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function walkImageReferences(value, callback, context) {
  if (typeof value === "string") {
    const match = value.match(IMAGE_PATH);
    if (match) callback(value, `assets/images/${match[1]}`, context);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkImageReferences(entry, callback, `${context}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => walkImageReferences(entry, callback, `${context}.${key}`));
  }
}

function replaceImageReferences(value, replacements) {
  if (typeof value === "string") return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map((entry) => replaceImageReferences(entry, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceImageReferences(entry, replacements)]));
  }
  return value;
}

function publicObjectUrl(supabaseUrl, objectPath) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/content-images/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function main() {
  const supabaseUrl = required("SUPABASE_URL");
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.");
  const client = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const db = new Client({ ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL), application_name: "white-impact-program-image-migration" });
  await db.connect();

  try {
    const { rows } = await db.query(`
      SELECT id, hero_image_url, gallery, beneficiaries, activities, objectives, feature_items
      FROM public.programs
      ORDER BY id
    `);
    const references = new Map();
    for (const row of rows) {
      const fields = { hero_image_url: row.hero_image_url, gallery: row.gallery, beneficiaries: row.beneficiaries, activities: row.activities, objectives: row.objectives, feature_items: row.feature_items };
      for (const [field, value] of Object.entries(fields)) {
        walkImageReferences(value, (source, relativePath, context) => {
          const entry = references.get(source) || { relativePath, uses: [] };
          entry.uses.push({ programId: row.id, field, context });
          references.set(source, entry);
        }, `program ${row.id}.${field}`);
      }
    }

    const replacementBySource = new Map();
    const objectByHash = new Map();
    const mapping = [];
    for (const [source, reference] of references) {
      const localFile = path.join(FRONTEND_ROOT, reference.relativePath);
      if (!fs.existsSync(localFile)) throw new Error(`Missing Program image source: ${reference.relativePath}`);
      const buffer = fs.readFileSync(localFile);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const extension = path.extname(localFile).slice(1).toLowerCase();
      let objectPath = objectByHash.get(hash);
      if (!objectPath) {
        const firstUse = reference.uses[0];
        const variant = firstUse.field === "hero_image_url" ? "hero" : "gallery";
        objectPath = `programs/${firstUse.programId}/${variant}/program-${hash}.${extension}`;
        objectByHash.set(hash, objectPath);
      }
      const existing = await client.storage.from("content-images").download(objectPath);
      if (existing.error) {
        const upload = await client.storage.from("content-images").upload(objectPath, buffer, {
          cacheControl: "3600",
          contentType: MIME_BY_EXTENSION[extension],
          upsert: false,
        });
        if (upload.error && !/already exists|duplicate/i.test(upload.error.message || "")) {
          throw new Error(`Upload failed for ${reference.relativePath}: ${upload.error.message}`);
        }
      }
      const url = publicObjectUrl(supabaseUrl, objectPath);
      replacementBySource.set(source, url);
      mapping.push({ source, objectPath, sha256: hash, uses: reference.uses.length });
    }

    await db.query("BEGIN");
    for (const row of rows) {
      const updates = {};
      const scalar = replacementBySource.get(row.hero_image_url);
      if (scalar) updates.hero_image_url = scalar;
      for (const field of ["gallery", "beneficiaries", "activities", "objectives", "feature_items"]) {
        const original = row[field];
        const replaced = replaceImageReferences(original, replacementBySource);
        if (JSON.stringify(replaced) !== JSON.stringify(original)) updates[field] = JSON.stringify(replaced);
      }
      if (Object.keys(updates).length) {
        const assignments = Object.keys(updates).map((field, index) => `${field} = $${index + 1}`).join(", ");
        await db.query(`UPDATE public.programs SET ${assignments}, updated_at = NOW() WHERE id = $${Object.keys(updates).length + 1}`, [...Object.values(updates), row.id]);
      }
    }
    await db.query("COMMIT");
    console.log(JSON.stringify({ migrated: true, programCount: rows.length, uniqueImages: mapping.length, mapping }, null, 2));
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Program image migration failed: ${error.message}`);
  process.exitCode = 1;
});
