/* Phase 18: remove the empty Generic Media bucket through the Storage API. */

const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BUCKET_ID = "media-library";

function requiredServerConfiguration() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL and a server-side Supabase admin key are required.");
  }
  return { url, key };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { url, key } = requiredServerConfiguration();
  const database = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "generic-media-storage-retirement",
  });
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await database.connect();
  try {
    const objects = await database.query(
      "SELECT count(*)::integer AS count FROM storage.objects WHERE bucket_id = $1",
      [BUCKET_ID],
    );
    const objectCount = objects.rows[0].count;
    if (objectCount !== 0) {
      throw new Error("Generic Media bucket is not empty and cannot be retired.");
    }

    if (!apply) {
      console.log(JSON.stringify({
        mode: "generic-media-storage-retirement-plan",
        bucket: BUCKET_ID,
        objectCount,
        applied: false,
      }));
      return;
    }

    const { error } = await supabase.storage.deleteBucket(BUCKET_ID);
    if (error) {
      throw new Error(`Supabase Storage bucket deletion failed: ${error.message}`);
    }
    console.log(JSON.stringify({
      mode: "generic-media-storage-retirement",
      bucket: BUCKET_ID,
      objectCount,
      applied: true,
    }));
  } finally {
    await database.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "generic-media-storage-retirement",
    applied: false,
    error: error?.message || "retirement-failed",
  }));
  process.exitCode = 1;
});
