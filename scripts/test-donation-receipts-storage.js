const path = require("node:path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BUCKET = "donation-receipts";

async function bufferFromBlob(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const browserKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const failures = [];

  const db = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-donation-receipt-storage-tests",
  });

  try {
    await db.connect();
    const bucket = await db.query(
      `SELECT id, public, file_size_limit, allowed_mime_types
       FROM storage.buckets
       WHERE id = $1`,
      [BUCKET],
    );
    const donations = await db.query(
      `SELECT id, receipt_url, receipt_storage_path, receipt_sha256,
              receipt_mime_type, receipt_size_bytes, receipt_migrated_at
       FROM public.donations
       WHERE receipt_url LIKE '/uploads/receipts/%'
       ORDER BY id`,
    );
    const allReceiptReferences = await db.query(
      `SELECT receipt_url, receipt_storage_path
       FROM public.donations
       WHERE receipt_url IS NOT NULL OR receipt_storage_path IS NOT NULL`,
    );
    const objects = await db.query(
      `SELECT name, metadata
       FROM storage.objects
       WHERE bucket_id = $1
       ORDER BY name`,
      [BUCKET],
    );

    const bucketRow = bucket.rows[0];
    if (!bucketRow) failures.push("donation-receipts bucket is missing");
    else {
      if (bucketRow.public !== false) failures.push("donation-receipts bucket must remain private");
      if (Number(bucketRow.file_size_limit) !== 5 * 1024 * 1024) failures.push("donation-receipts bucket size limit mismatch");
      for (const mime of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
        if (!bucketRow.allowed_mime_types?.includes(mime)) {
          failures.push(`donation-receipts bucket missing MIME type: ${mime}`);
        }
      }
    }

    if (donations.rowCount !== 2) failures.push("expected exactly two legacy receipt donation records");

    const objectNames = new Set(objects.rows.map((row) => row.name));
    const referencedObjectNames = new Set(
      allReceiptReferences.rows.flatMap((row) => [row.receipt_storage_path, String(row.receipt_url || "").replace(/^\//, "")].filter(Boolean)),
    );
    const unreferencedObjects = objects.rows.filter((row) => !referencedObjectNames.has(row.name));
    const retainedHistoricalObjects = unreferencedObjects.filter((row) => row.name.startsWith("uploads/receipts/"));
    const unexpectedUnreferencedObjects = unreferencedObjects.filter((row) => !row.name.startsWith("uploads/receipts/"));
    if (unexpectedUnreferencedObjects.length) {
      failures.push("unexpected unreferenced donation receipt Storage object exists");
    }
    for (const donation of donations.rows) {
      if (!donation.receipt_storage_path) failures.push(`donation ${donation.id}: storage path missing`);
      if (!donation.receipt_sha256) failures.push(`donation ${donation.id}: checksum missing`);
      if (!donation.receipt_mime_type) failures.push(`donation ${donation.id}: MIME type missing`);
      if (!Number(donation.receipt_size_bytes)) failures.push(`donation ${donation.id}: size missing`);
      if (!donation.receipt_migrated_at) failures.push(`donation ${donation.id}: migrated timestamp missing`);
      if (donation.receipt_storage_path && !objectNames.has(donation.receipt_storage_path)) {
        failures.push(`donation ${donation.id}: storage object missing`);
      }
      if (!String(donation.receipt_url || "").startsWith("/uploads/receipts/")) {
        failures.push(`donation ${donation.id}: legacy rollback URL was not retained`);
      }
    }

    let serviceDownloads = 0;
    if (supabaseUrl && serviceKey) {
      const serviceClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      for (const donation of donations.rows) {
        const { data, error } = await serviceClient.storage
          .from(BUCKET)
          .download(donation.receipt_storage_path);
        if (error || !data) {
          failures.push(`donation ${donation.id}: service download failed`);
          continue;
        }
        const bytes = await bufferFromBlob(data);
        serviceDownloads += 1;
        if (bytes.length !== Number(donation.receipt_size_bytes)) {
          failures.push(`donation ${donation.id}: service download size mismatch`);
        }
      }
    } else {
      failures.push("SUPABASE_URL and server-side Supabase key are required for service download verification");
    }

    let anonymousDownloadDenied = null;
    if (supabaseUrl && browserKey && donations.rows[0]?.receipt_storage_path) {
      const anonClient = createClient(supabaseUrl, browserKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await anonClient.storage
        .from(BUCKET)
        .download(donations.rows[0].receipt_storage_path);
      anonymousDownloadDenied = Boolean(error || !data);
      if (!anonymousDownloadDenied) failures.push("anonymous receipt download must be denied");
    }

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-donation-receipts-storage-tests",
      destructiveChanges: false,
      passed,
      bucketPrivate: bucketRow ? bucketRow.public === false : false,
      legacyReceiptRecords: donations.rowCount,
      storageObjectCount: objects.rowCount,
      referencedStorageObjectCount: objects.rows.length - unreferencedObjects.length,
      retainedHistoricalObjectCount: retainedHistoricalObjects.length,
      serviceDownloads,
      anonymousDownloadDenied,
      legacyRollbackUrlsRetained: donations.rows.every((row) => String(row.receipt_url || "").startsWith("/uploads/receipts/")),
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-donation-receipts-storage-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
    errorMessage: error?.message || "test failed",
  }, null, 2));
  process.exitCode = 1;
});
