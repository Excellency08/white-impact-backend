const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

async function main() {
  const client = new Client({ ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL), application_name: "white-impact-project-storage-tests" });
  const failures = [];
  try {
    await client.connect();
    const projects = await client.query("SELECT id, slug, program_slug, hero_image_url, media FROM public.projects ORDER BY id");
    const programs = await client.query("SELECT slug FROM public.programs");
    const programSlugs = new Set(programs.rows.map((row) => row.slug));
    const refs = [];
    const collect = (value, context, projectId) => {
      if (typeof value === "string") {
        const match = value.match(/\/storage\/v1\/object\/public\/content-images\/([^?#]+)/);
        if (match) refs.push({ projectId, context, objectPath: decodeURIComponent(match[1]) });
        return;
      }
      if (Array.isArray(value)) return value.forEach((entry, index) => collect(entry, `${context}[${index}]`, projectId));
      if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => collect(entry, `${context}.${key}`, projectId));
    };
    for (const row of projects.rows) {
      if (!programSlugs.has(row.program_slug)) failures.push(`project ${row.id}: broken program_slug`);
      collect(row.hero_image_url, "hero_image_url", row.id);
      collect(row.media, "media", row.id);
    }
    const paths = [...new Set(refs.map((ref) => ref.objectPath))];
    const objects = paths.length
      ? await client.query("SELECT name, metadata FROM storage.objects WHERE bucket_id='content-images' AND name=ANY($1::text[])", [paths])
      : { rows: [] };
    const byPath = new Map(objects.rows.map((row) => [row.name, row]));
    for (const ref of refs) {
      const owner = (ref.objectPath.match(/^projects\/(\d+)\//) || [])[1];
      if (String(owner) !== String(ref.projectId)) failures.push(`${ref.context}: wrong Project owner path`);
      if (!byPath.has(ref.objectPath)) failures.push(`${ref.context}: missing Storage object`);
    }
    const policies = await client.query(`SELECT COUNT(*)::integer AS count FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname = ANY($1::text[]) AND 'authenticated'=ANY(roles)`, [[
      "storage_content_images_projects_select", "storage_content_images_projects_insert", "storage_content_images_projects_update", "storage_content_images_projects_delete",
    ]]);
    if (Number(policies.rows[0].count) !== 4) failures.push("Project Storage policy set is incomplete");
    const passed = failures.length === 0;
    console.log(JSON.stringify({ mode: "read-only-project-storage-tests", destructiveChanges: false, passed, projects: projects.rowCount, projectImageReferences: refs.length, storageObjectsChecked: byPath.size, projectStoragePolicies: Number(policies.rows[0].count), failures }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({ mode: "read-only-project-storage-tests", destructiveChanges: false, passed: false, errorCode: error?.code || "test-failed", errorMessage: error?.message || "test failed" }, null, 2));
  process.exitCode = 1;
});
