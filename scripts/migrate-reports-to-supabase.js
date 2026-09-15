require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");
const { createPoolConfig } = require("../db/connection-config");

const REPORTS = [
  {
    id: 1,
    filename: "2024-wttc-introduction-to-ai.pdf",
    sha256: "921a26c391644b7d312f38128f4ffb37b92a7303f78aee98354b741ee95f84b9",
  },
  {
    id: 2,
    filename: "PROPOSED PLAN OF ACTION FOR 2026 COMMUNITY OUTREACH (1).pdf",
    sha256: "921a26c391644b7d312f38128f4ffb37b92a7303f78aee98354b741ee95f84b9",
  },
];

const frontendAssets = path.resolve(
  __dirname,
  "../../white-impact-frontend/assets/images",
);
let currentStage = "startup";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function publicUrl(supabase, objectPath) {
  return supabase.storage.from("reports").getPublicUrl(objectPath).data.publicUrl;
}

function safeStorageError(error) {
  return {
    name: error?.name || null,
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    message: error?.message || "Unknown Supabase Storage error.",
  };
}

async function main() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and a server-side Supabase admin key are required.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = new Client({
    ...createPoolConfig(process.env.DIRECT_URL),
    application_name: "phase-10d-reports-migration",
  });

  currentStage = "database connection";
  await db.connect();
  try {
    for (const report of REPORTS) {
      currentStage = `source verification for report ${report.id}`;
      const filePath = path.join(frontendAssets, report.filename);
      const buffer = fs.readFileSync(filePath);
      if (sha256(buffer) !== report.sha256) {
        throw new Error(`Checksum mismatch for report ${report.id}.`);
      }

      currentStage = `database lookup for report ${report.id}`;
      const { rows } = await db.query(
        "SELECT id, storage_provider, storage_path FROM public.reports WHERE id = $1 LIMIT 1",
        [report.id],
      );
      if (!rows.length) throw new Error(`Report ${report.id} was not found.`);

      let objectPath = rows[0].storage_path;
      if (!objectPath) {
        currentStage = `Supabase Storage upload for report ${report.id}`;
        objectPath = `reports/${report.id}/report-${crypto.randomUUID()}.pdf`;
        const upload = await supabase.storage
          .from("reports")
          .upload(objectPath, buffer, {
            contentType: "application/pdf",
            cacheControl: "3600",
            upsert: false,
          });
        if (upload.error) {
          const details = safeStorageError(upload.error);
          const error = new Error(details.message);
          error.safeDetails = details;
          throw error;
        }
      }

      currentStage = `database metadata update for report ${report.id}`;
      const url = publicUrl(supabase, objectPath);
      await db.query(
        `UPDATE public.reports
         SET storage_provider = 'supabase',
             storage_path = $1,
             original_filename = $2,
             file_size = $3,
             mime_type = 'application/pdf',
             file_url = $4,
             preview_url = $4,
             file_type = 'application/pdf',
             updated_at = NOW()
         WHERE id = $5`,
        [objectPath, report.filename, buffer.length, url, report.id],
      );
    }
  } finally {
    await db.end();
  }

  console.log(JSON.stringify({
    mode: "reports-storage-migration",
    migratedReports: REPORTS.length,
    bucket: "reports",
    originalFilesRetained: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ mode: "reports-storage-migration", success: false, stage: currentStage, error: error.safeDetails || { message: error.message } }, null, 2));
  process.exitCode = 1;
});
