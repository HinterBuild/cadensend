-- 008 rollback
DROP INDEX IF EXISTS idx_sources_injection_status;
ALTER TABLE sources DROP COLUMN IF NOT EXISTS injection_findings;
ALTER TABLE sources DROP COLUMN IF NOT EXISTS injection_status;
