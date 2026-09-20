require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { createPoolConfig } = require("../db/connection-config");

const RECEIPT_BUCKET = "donation-receipts";
const LEGACY_PREFIX = "/uploads/receipts/";
let stage = "startup";

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function mimeType(filename) {
  const extension = path.extname(filename).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  }[extension] || null;
}

function safeError(error) {
  return {
    stage,
    name: error?.name || "Error",
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    message: error?.message || "Receipt migration failed.",
  };
}

async function main() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Supabase URL and server-side admin key are required.");

  const storage = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = new Client({
    ...createPoolConfig(process.env.DIRECT_URL),
    application_name: "donation-receipt-storage-migration",
  });

  stage = "database connection";
  await db.connect();
  try {
    stage = "receipt inventory";
    const { rows } = await db.query(
      `SELECT id, reference, receipt_url, receipt_storage_path
       FROM public.donations
       WHERE receipt_url LIKE $1
       ORDER BY id`,
      [`${LEGACY_PREFIX}%`],
    );

    const migrated = [];
    for (const donation of rows) {
      const filename = path.basename(donation.receipt_url);
      const sourcePath = path.join(__dirname, "../uploads/receipts", filename);
      stage = `source verification for donation ${donation.id}`;
      if (!fs.existsSync(sourcePath)) throw new Error(`Receipt source is missing for donation ${donation.id}.`);

      const contentType = mimeType(filename);
      if (!contentType) throw new Error(`Unsupported receipt type for donation ${donation.id}.`);
      const buffer = fs.readFileSync(sourcePath);
      const sha256 = checksum(buffer);
      const extension = path.extname(filename).toLowerCase();
      const objectPath = donation.receipt_storage_path || `donation-receipts/${donation.id}/receipt-${sha256.slice(0, 16)}${extension}`;

      stage = `private Storage upload for donation ${donation.id}`;
      const upload = await storage.storage.from(RECEIPT_BUCKET).upload(objectPath, buffer, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });
      if (upload.error && !/already exists/i.test(upload.error.message || "")) throw upload.error;

      stage = `private Storage verification for donation ${donation.id}`;
      const download = await storage.storage.from(RECEIPT_BUCKET).download(objectPath);
      if (download.error) throw download.error;
      const uploadedBuffer = Buffer.from(await download.data.arrayBuffer());
      if (uploadedBuffer.length !== buffer.length || checksum(uploadedBuffer) !== sha256) {
        throw new Error(`Checksum mismatch for donation ${donation.id}.`);
      }

      stage = `database metadata update for donation ${donation.id}`;
      await db.query(
        `UPDATE public.donations
         SET receipt_storage_path = $1,
             receipt_sha256 = $2,
             receipt_mime_type = $3,
             receipt_size_bytes = $4,
             receipt_migrated_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [objectPath, sha256, contentType, buffer.length, donation.id],
      );
      migrated.push({ id: donation.id, size: buffer.length, checksumVerified: true });
    }

    console.log(JSON.stringify({
      mode: "private-donation-receipt-migration",
      bucket: RECEIPT_BUCKET,
      migratedCount: migrated.length,
      checksumVerified: migrated.every((entry) => entry.checksumVerified),
      originalFilesRetained: true,
      records: migrated,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ mode: "private-donation-receipt-migration", success: false, error: safeError(error) }, null, 2));
  process.exitCode = 1;
});
