/* One-time Phase 14C cleanup for verified Story-owned Storage objects. */

const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

async function main() {
  const supabaseUrl = required("SUPABASE_URL");
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("A server-side Supabase key is required.");

  const db = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-story-storage-cleanup",
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.connect();
  try {
    const { rows } = await db.query("SELECT name FROM storage.objects WHERE bucket_id = 'content-images' AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+$' ORDER BY name");
    const paths = rows.map((row) => row.name);
    if (paths.length) {
      const { error } = await admin.storage.from("content-images").remove(paths);
      if (error) throw new Error(`Story Storage cleanup failed: ${error.message}`);
    }
    const remaining = await db.query("SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id = 'content-images' AND name ~ '^stories/[0-9]+/(hero|media)/[^/]+$'");
    if (Number(remaining.rows[0].count) !== 0) throw new Error("Story Storage cleanup verification failed.");
    console.log(JSON.stringify({ removed: paths.length, remaining: Number(remaining.rows[0].count), bucket: "content-images", ownership: "verified Story-owned paths only" }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Story Storage cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
