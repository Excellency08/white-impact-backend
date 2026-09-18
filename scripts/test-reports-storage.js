const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const requiredColumns = [
  "storage_provider",
  "storage_path",
  "original_filename",
  "file_size",
  "mime_type",
];

async function main() {
  const client = new Client({
    ...createPoolConfig(process.env.DIRECT_URL),
    application_name: "white-impact-reports-storage-tests",
  });

  try {
    await client.connect();
    const columns = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'reports'
         AND column_name = ANY($1::text[])`,
      [requiredColumns],
    );
    const bucket = await client.query(
      `SELECT id, public, file_size_limit, allowed_mime_types
       FROM storage.buckets WHERE id = 'reports'`,
    );
    const policies = await client.query(
      `SELECT policyname, cmd, roles
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = ANY($1::text[])`,
      [["storage_reports_select", "storage_reports_insert", "storage_reports_update"]],
    );
    const reports = await client.query(
      `SELECT id, file_url, storage_provider, storage_path, file_size, mime_type
       FROM public.reports ORDER BY id`,
    );
    const objects = await client.query(
      `SELECT name FROM storage.objects
       WHERE bucket_id = 'reports'
         AND name ~ '^reports/[0-9]+/[^/]+\\.pdf$'`,
    );
    const downloadFunction = await client.query(
      `SELECT p.prosecdef AS security_definer,
              pg_get_function_identity_arguments(p.oid) AS arguments,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'record_public_report_download'`,
    );

    const failures = [];
    const foundColumns = new Set(columns.rows.map((row) => row.column_name));
    for (const column of requiredColumns) {
      if (!foundColumns.has(column)) failures.push(`reports.${column}: missing`);
    }
    const reportBucket = bucket.rows[0];
    if (!reportBucket) failures.push("reports bucket: missing");
    else {
      if (!reportBucket.public) failures.push("reports bucket: must be public for reads");
      if (Number(reportBucket.file_size_limit) !== 25 * 1024 * 1024) {
        failures.push("reports bucket: file size limit mismatch");
      }
      if (!reportBucket.allowed_mime_types?.includes("application/pdf")) {
        failures.push("reports bucket: PDF MIME type is not allowed");
      }
    }
    for (const name of ["storage_reports_select", "storage_reports_insert", "storage_reports_update"]) {
      if (!policies.rows.some((row) => row.policyname === name && row.roles.includes("authenticated"))) {
        failures.push(`${name}: authenticated policy missing`);
      }
    }
    if (reports.rowCount !== 2) failures.push("reports: expected two existing records");
    for (const report of reports.rows) {
      if (report.storage_provider !== "supabase") failures.push(`report ${report.id}: provider mismatch`);
      if (!/^reports\/\d+\/[^/]+\.pdf$/.test(report.storage_path || "")) failures.push(`report ${report.id}: path mismatch`);
      if (Number(report.file_size) <= 0 || report.mime_type !== "application/pdf") {
        failures.push(`report ${report.id}: file metadata mismatch`);
      }
    }
    if (objects.rowCount !== reports.rowCount) failures.push("storage objects: report count mismatch");

    const downloadRpc = downloadFunction.rows[0];
    if (!downloadRpc) {
      failures.push("record_public_report_download RPC: missing");
    } else {
      if (!downloadRpc.security_definer) failures.push("record_public_report_download RPC: must be security definer");
      if (downloadRpc.arguments !== "p_slug text") failures.push("record_public_report_download RPC: argument shape mismatch");
      if (!downloadRpc.anon_execute || !downloadRpc.authenticated_execute) {
        failures.push("record_public_report_download RPC: required execution grants missing");
      }
    }

    const publicChecks = [];
    for (const report of reports.rows) {
      const response = await fetch(report.file_url);
      publicChecks.push({ reportId: report.id, status: response.status, contentType: response.headers.get("content-type") });
      if (response.status !== 200) failures.push(`report ${report.id}: public URL is not readable`);
      if (!String(response.headers.get("content-type") || "").startsWith("application/pdf")) {
        failures.push(`report ${report.id}: public MIME type mismatch`);
      }
    }

    const passed = failures.length === 0;
    console.log(JSON.stringify({
      mode: "read-only-reports-storage-tests",
      destructiveChanges: false,
      passed,
      requiredColumnCount: columns.rowCount,
      reportCount: reports.rowCount,
      storageObjectCount: objects.rowCount,
      downloadTrackingRpc: downloadRpc
        ? {
            securityDefiner: downloadRpc.security_definer,
            arguments: downloadRpc.arguments,
            anonExecute: downloadRpc.anon_execute,
            authenticatedExecute: downloadRpc.authenticated_execute,
          }
        : null,
      publicChecks,
      failures,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    mode: "read-only-reports-storage-tests",
    destructiveChanges: false,
    passed: false,
    errorCode: error?.code || error?.errno || "test-failed",
    message: error?.message || "unknown error",
  }, null, 2));
  process.exitCode = 1;
});
