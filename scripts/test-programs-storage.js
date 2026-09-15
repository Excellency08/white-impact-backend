const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-program-storage-tests",
  });
  const failures = [];
  try {
    await client.connect();
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM public.programs) AS programs,
        (SELECT COUNT(*) FROM public.program_beneficiaries) AS beneficiaries,
        (SELECT COUNT(*) FROM public.program_locations) AS locations,
        (SELECT COUNT(*) FROM public.program_timeline) AS timeline,
        (SELECT COUNT(*) FROM public.program_gallery) AS gallery,
        (SELECT COUNT(*) FROM public.program_impact_metrics) AS impact_metrics,
        (SELECT COUNT(*) FROM public.program_reports) AS reports,
        (SELECT COUNT(*) FROM public.program_partners) AS partners
    `);
    const imageReferences = await client.query(`
      SELECT id, hero_image_url, gallery, beneficiaries, activities, objectives, feature_items
      FROM public.programs
    `);
    const legacyImage = /(?:^|["'])\.\/?assets\/images\//;
    const urls = [];
    for (const row of imageReferences.rows) {
      if (legacyImage.test(row.hero_image_url || "")) failures.push(`program ${row.id}: legacy hero image remains`);
      const serialized = JSON.stringify([row.gallery, row.beneficiaries, row.activities, row.objectives, row.feature_items]);
      if (legacyImage.test(serialized)) failures.push(`program ${row.id}: legacy JSON image remains`);
      urls.push(row.hero_image_url || "");
    }
    const invalidUrl = urls.some((url) => url && !url.includes("/storage/v1/object/public/content-images/"));
    if (invalidUrl) failures.push("one or more Program hero images are not in content-images");

    const relation = await client.query(`
      SELECT COUNT(*) FILTER (WHERE p.program_slug IS NOT NULL AND pr.id IS NULL) AS broken,
             COUNT(*) FILTER (WHERE p.program_slug IS NOT NULL) AS linked
      FROM public.projects p
      LEFT JOIN public.programs pr ON pr.slug = p.program_slug
    `);
    if (Number(relation.rows[0].broken) > 0) failures.push("project program_slug mapping contains an orphan");

    const policy = await client.query(`
      SELECT COUNT(*)::integer AS count
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = ANY($1::text[])
        AND 'authenticated' = ANY(roles)
    `, [[
      "storage_content_images_select",
      "storage_content_images_insert",
      "storage_content_images_update",
      "storage_content_images_delete",
    ]]);
    if (Number(policy.rows[0].count) !== 4) failures.push("content-images does not have all four authenticated policies");

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-program-storage-tests",
      destructiveChanges: false,
      passed,
      counts: counts.rows[0],
      projectProgramLinks: relation.rows[0].linked,
      contentImagesPolicies: Number(policy.rows[0].count),
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({ mode: "read-only-program-storage-tests", destructiveChanges: false, passed: false, errorCode: error?.code || "test-failed", errorMessage: error?.message || "test failed" }, null, 2));
  process.exitCode = 1;
});
