const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const expectedBuckets = {
  "team-photos": { public: true, size: 5 * 1024 * 1024 },
  "media-library": { public: false, size: 100 * 1024 * 1024 },
  "donation-receipts": { public: false, size: 5 * 1024 * 1024 },
  reports: { public: true, size: 25 * 1024 * 1024 },
  "content-images": { public: true, size: 10 * 1024 * 1024 },
};

const expectedPolicies = [
  "storage_team_photos_insert",
  "storage_team_photos_update",
  "storage_team_photos_delete",
  "storage_media_library_select",
  "storage_media_library_insert",
  "storage_media_library_update",
  "storage_media_library_delete",
  "storage_donation_receipts_select",
  "storage_donation_receipts_delete",
  "storage_reports_select",
  "storage_reports_insert",
  "storage_reports_update",
  "storage_content_images_select",
  "storage_content_images_insert",
  "storage_content_images_update",
  "storage_content_images_delete",
  "storage_content_images_projects_select",
  "storage_content_images_projects_insert",
  "storage_content_images_projects_update",
  "storage_content_images_projects_delete",
  "storage_content_images_stories_select",
  "storage_content_images_stories_insert",
  "storage_content_images_stories_update",
  "storage_content_images_stories_delete",
];

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL),
    application_name: "white-impact-storage-policy-tests",
  });

  try {
    await client.connect();
    const buckets = await client.query(
      `SELECT id, public, file_size_limit
       FROM storage.buckets
       WHERE id = ANY($1::text[])`,
      [Object.keys(expectedBuckets)],
    );
    const policies = await client.query(
      `SELECT policyname, cmd, roles
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = ANY($1::text[])`,
      [expectedPolicies],
    );

    const failures = [];
    for (const [id, expected] of Object.entries(expectedBuckets)) {
      const bucket = buckets.rows.find((row) => row.id === id);
      if (!bucket) {
        failures.push(`${id}: bucket is missing`);
        continue;
      }
      if (bucket.public !== expected.public) failures.push(`${id}: public flag mismatch`);
      if (Number(bucket.file_size_limit) !== expected.size) failures.push(`${id}: size limit mismatch`);
    }

    for (const policy of expectedPolicies) {
      if (!policies.rows.some((row) => row.policyname === policy && row.roles.includes("authenticated"))) {
        failures.push(`${policy}: authenticated policy is missing`);
      }
    }

    if (policies.rows.some((row) => row.roles.includes("anon"))) {
      failures.push("storage.objects: anonymous policy must not exist");
    }

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-storage-policy-catalog-tests",
      destructiveChanges: false,
      passed,
      bucketCount: buckets.rowCount,
      expectedBucketCount: Object.keys(expectedBuckets).length,
      policyCount: policies.rowCount,
      expectedPolicyCount: expectedPolicies.length,
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-storage-policy-catalog-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
  }, null, 2));
  process.exitCode = 1;
});
