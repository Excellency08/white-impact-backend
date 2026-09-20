-- Keep legacy receipt_url intact for rollback while private Storage becomes
-- the authoritative location for migrated donation receipts.
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS receipt_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS receipt_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS receipt_mime_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS receipt_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS receipt_migrated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_donations_receipt_storage_path
  ON public.donations (receipt_storage_path)
  WHERE receipt_storage_path IS NOT NULL;
