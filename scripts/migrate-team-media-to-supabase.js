/* Phase 17: migrate the three remaining legacy Team image references. */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const TEAM_IDS = [1, 3, 5];
const MEDIA_ROOT = path.resolve(__dirname, "..", "uploads", "media");
const TEAM_BUCKET = "team-photos";
const allowedMimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safePathFromPhotoUrl(photoUrl) {
  const rawPath = String(photoUrl || "").startsWith("http")
    ? new URL(photoUrl).pathname
    : String(photoUrl || "");
  if (!rawPath.startsWith("/uploads/media/")) {
    throw new Error("Team photo is not a legacy media path.");
  }
  const relative = decodeURIComponent(rawPath).replace(/^\//, "");
  const localPath = path.resolve(__dirname, "..", relative);
  if (!localPath.startsWith(`${MEDIA_ROOT}${path.sep}`)) {
    throw new Error("Team photo path escapes the legacy media directory.");
  }
  return localPath;
}

function storagePath(memberId, extension, digest) {
  return `uploads/team/${memberId}/team-${digest.slice(0, 16)}${extension}`;
}

async function scanLegacyReferences(pg, needle) {
  const tables = await pg.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const references = [];
  for (const { table_name: tableName } of tables.rows) {
    const safeTable = tableName.replaceAll('"', '""');
    const result = await pg.query(
      `SELECT count(*)::integer AS count
       FROM public."${safeTable}" AS row_data
       WHERE to_jsonb(row_data)::text ILIKE $1`,
      [`%${needle}%`],
    );
    if (result.rows[0].count) references.push({ table: tableName, count: result.rows[0].count });
  }
  return references;
}

async function downloadAndVerify(storage, objectPath, expected) {
  const result = await storage.download(objectPath);
  if (result.error) throw new Error(`Storage download failed: ${result.error.message}`);
  const buffer = Buffer.from(await result.data.arrayBuffer());
  const actualChecksum = checksum(buffer);
  if (buffer.length !== expected.size || actualChecksum !== expected.checksum) {
    throw new Error("Storage object size/checksum does not match the local source.");
  }
  return { size: buffer.length, checksum: actualChecksum };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and a server-side Supabase admin key are required.");
  }

  const pg = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "team-media-supabase-migration",
  });
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const storage = supabase.storage.from(TEAM_BUCKET);
  await pg.connect();
  try {
    const result = await pg.query(
      `SELECT id, full_name, photo_url, role, bio, display_order, is_active
       FROM public.team_members
       WHERE id = ANY($1::integer[])
       ORDER BY id`,
      [TEAM_IDS],
    );
    if (result.rows.length !== TEAM_IDS.length) {
      throw new Error("The expected Team rows were not all found.");
    }

    const plans = [];
    for (const row of result.rows) {
      const currentUrl = String(row.photo_url || "");
      const teamPrefix = `/storage/v1/object/public/${TEAM_BUCKET}/uploads/team/${row.id}/`;
      if (!currentUrl.includes("/uploads/media/")) {
        if (!currentUrl.includes(teamPrefix)) {
          throw new Error(`Team member ${row.id} has an unexpected photo path.`);
        }
        plans.push({ row, objectPath: currentUrl.split(teamPrefix)[1] ? `uploads/team/${row.id}/${currentUrl.split(teamPrefix)[1]}` : "", migrated: true });
        continue;
      }
      const localPath = safePathFromPhotoUrl(row.photo_url);
      if (!fs.existsSync(localPath)) throw new Error(`Local Team image is missing for member ${row.id}.`);
      const buffer = fs.readFileSync(localPath);
      const extension = path.extname(localPath).toLowerCase();
      const mimeType = allowedMimeTypes[extension];
      if (!mimeType) throw new Error(`Unsupported Team image extension for member ${row.id}.`);
      const digest = checksum(buffer);
      const objectPath = storagePath(row.id, extension, digest);
      const references = await scanLegacyReferences(pg, row.photo_url);
      plans.push({
        row,
        localPath,
        objectPath,
        mimeType,
        size: buffer.length,
        checksum: digest,
        references,
        migrated: false,
      });
    }

    for (const plan of plans) {
      if (!apply) {
        console.log(JSON.stringify({
          memberId: plan.row.id,
          localPath: plan.localPath || null,
          objectPath: plan.objectPath,
          mimeType: plan.mimeType || null,
          size: plan.size || null,
          checksum: plan.checksum || null,
          referencesBeforeUpdate: plan.references,
          alreadyMigrated: Boolean(plan.migrated),
          databaseUpdated: false,
        }));
        continue;
      }
      if (plan.migrated) {
        const existing = await storage.download(plan.objectPath);
        if (existing.error || !existing.data) throw new Error(`Existing Team Storage object is unavailable for member ${plan.row.id}.`);
        const bytes = Buffer.from(await existing.data.arrayBuffer());
        const publicUrl = storage.getPublicUrl(plan.objectPath).data.publicUrl;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
          response = await fetch(publicUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
        if (!response.ok) throw new Error(`Existing Team image URL returned HTTP ${response.status}.`);
        const publicBytes = Buffer.from(await response.arrayBuffer());
        if (publicBytes.length !== bytes.length || checksum(publicBytes) !== checksum(bytes)) {
          throw new Error(`Existing Team image public checksum mismatch for member ${plan.row.id}.`);
        }
        console.log(JSON.stringify({ memberId: plan.row.id, objectPath: plan.objectPath, size: bytes.length, checksum: checksum(bytes), alreadyMigrated: true, databaseUpdated: false }));
        continue;
      }
      const existing = await storage.download(plan.objectPath);
      if (existing.data) {
        await downloadAndVerify(storage, plan.objectPath, plan);
      } else {
        if (existing.error && !/not found|does not exist|no such object/i.test(existing.error.message || "")) {
          throw new Error(`Storage lookup failed for member ${plan.row.id}: ${existing.error.message}`);
        }
        const upload = await storage.upload(plan.objectPath, fs.readFileSync(plan.localPath), {
          cacheControl: "3600",
          contentType: plan.mimeType,
          upsert: false,
        });
        if (upload.error && !/already exists/i.test(upload.error.message || "")) {
          throw new Error(`Storage upload failed for member ${plan.row.id}: ${upload.error.message}`);
        }
        await downloadAndVerify(storage, plan.objectPath, plan);
      }

      const publicUrl = storage.getPublicUrl(plan.objectPath).data.publicUrl;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(publicUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`Public Team image URL returned HTTP ${response.status}.`);
      const publicBytes = Buffer.from(await response.arrayBuffer());
      if (publicBytes.length !== plan.size || checksum(publicBytes) !== plan.checksum) {
        throw new Error(`Public Team image checksum mismatch for member ${plan.row.id}.`);
      }

      if (apply) {
        const update = await pg.query(
          `UPDATE public.team_members
           SET photo_url = $1
           WHERE id = $2 AND photo_url = $3
           RETURNING id, photo_url`,
          [publicUrl, plan.row.id, plan.row.photo_url],
        );
        if (!update.rows.length) throw new Error(`Team member ${plan.row.id} changed during migration.`);
      }

      console.log(JSON.stringify({
        memberId: plan.row.id,
        objectPath: plan.objectPath,
        mimeType: plan.mimeType,
        size: plan.size,
        checksum: plan.checksum,
        referencesBeforeUpdate: plan.references,
        databaseUpdated: apply,
      }));
    }

    const final = await pg.query(
      `SELECT id, full_name, role, bio, display_order, is_active, photo_url
       FROM public.team_members
       ORDER BY id`,
    );
    const legacyActive = final.rows.filter((row) => row.is_active && String(row.photo_url || "").includes("/uploads/media/"));
    console.log(JSON.stringify({
      mode: apply ? "team-media-migration" : "team-media-dry-run",
      destructiveChanges: false,
      teamRowCount: final.rows.length,
      teamIds: final.rows.map((row) => row.id),
      activeLegacyPhotoReferences: legacyActive.length,
      localFilesDeleted: false,
      mediaAssetsDeleted: false,
      storageObjectsDeleted: false,
    }, null, 2));
    if (apply && legacyActive.length) throw new Error("Active Team legacy photo references remain.");
  } finally {
    await pg.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    mode: "team-media-migration",
    passed: false,
    error: error.message || "migration failed",
  }));
  process.exitCode = 1;
});
