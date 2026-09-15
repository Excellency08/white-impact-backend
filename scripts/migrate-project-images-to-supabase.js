/* Phase 13 restart-safe Project image migration. Legacy files are retained. */

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
const MIME_BY_EXTENSION = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function walk(value, callback, context) {
  if (typeof value === "string") {
    const match = value.match(IMAGE_PATH);
    if (match) callback(value, `assets/images/${match[1]}`, context);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => walk(entry, callback, `${context}[${index}]`));
  if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => walk(entry, callback, `${context}.${key}`));
}

function replace(value, replacements) {
  if (typeof value === "string") return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map((entry) => replace(entry, replacements));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replace(entry, replacements)]));
  return value;
}

function publicUrl(base, objectPath) {
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/content-images/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}

async function main() {
  const supabaseUrl = required("SUPABASE_URL");
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.");
  const storage = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from("content-images");
  const db = new Client({ ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL), application_name: "white-impact-project-image-migration" });
  await db.connect();
  try {
    const { rows } = await db.query("SELECT id, hero_image_url, media FROM public.projects ORDER BY id");
    const references = new Map();
    for (const row of rows) {
      walk(row.hero_image_url, (source, relativePath, context) => {
        const item = references.get(`${row.id}:${source}`) || { projectId: row.id, source, relativePath, uses: [] };
        item.uses.push({ field: "hero_image_url", context });
        references.set(`${row.id}:${source}`, item);
      }, `project ${row.id}.hero_image_url`);
      walk(row.media, (source, relativePath, context) => {
        const item = references.get(`${row.id}:${source}`) || { projectId: row.id, source, relativePath, uses: [] };
        item.uses.push({ field: "media", context });
        references.set(`${row.id}:${source}`, item);
      }, `project ${row.id}.media`);
    }

    const replacements = new Map();
    const verified = [];
    for (const reference of references.values()) {
      const localFile = path.join(FRONTEND_ROOT, reference.relativePath);
      if (!fs.existsSync(localFile)) throw new Error(`Missing Project image source: ${reference.relativePath}`);
      const buffer = fs.readFileSync(localFile);
      const extension = path.extname(localFile).slice(1).toLowerCase();
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const variant = reference.uses[0].field === "hero_image_url" ? "hero" : "media";
      const objectPath = `projects/${reference.projectId}/${variant}/project-${sha256}.${extension}`;
      const existing = await storage.download(objectPath);
      if (existing.error) {
        const upload = await storage.upload(objectPath, buffer, { cacheControl: "3600", contentType: MIME_BY_EXTENSION[extension], upsert: false });
        if (upload.error && !/already exists|duplicate/i.test(upload.error.message || "")) throw new Error(`Upload failed for ${objectPath}: ${upload.error.message}`);
      }
      const check = await storage.download(objectPath);
      if (check.error) throw new Error(`Storage verification failed for ${objectPath}: ${check.error.message}`);
      const actual = Buffer.from(await check.data.arrayBuffer());
      if (actual.length !== buffer.length || crypto.createHash("sha256").update(actual).digest("hex") !== sha256 || check.data.type !== MIME_BY_EXTENSION[extension]) throw new Error(`Checksum, size, or MIME mismatch for ${objectPath}`);
      replacements.set(`${reference.projectId}:${reference.source}`, publicUrl(supabaseUrl, objectPath));
      verified.push({ projectId: reference.projectId, source: reference.source, objectPath, sha256, size: buffer.length, contentType: MIME_BY_EXTENSION[extension], uses: reference.uses.length });
    }

    await db.query("BEGIN");
    for (const row of rows) {
      const nextHero = replacements.get(`${row.id}:${row.hero_image_url}`) || row.hero_image_url;
      const nextMedia = replace(row.media, new Map([...replacements.entries()].filter(([key]) => key.startsWith(`${row.id}:`)).map(([key, value]) => [key.slice(String(row.id).length + 1), value])));
      if (nextHero !== row.hero_image_url || JSON.stringify(nextMedia) !== JSON.stringify(row.media)) {
        const result = await db.query("UPDATE public.projects SET hero_image_url=$1, media=$2::jsonb WHERE id=$3 AND hero_image_url=$4 AND media=$5::jsonb", [nextHero, JSON.stringify(nextMedia), row.id, row.hero_image_url, JSON.stringify(row.media)]);
        if (result.rowCount !== 1) throw new Error(`Project ${row.id} changed concurrently`);
      }
    }
    await db.query("COMMIT");
    console.log(JSON.stringify({ migrated: true, projectCount: rows.length, uniqueProjectImages: verified.length, mapping: verified }, null, 2));
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Project image migration failed: ${error.message}`);
  process.exitCode = 1;
});
