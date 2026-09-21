-- 016 rollback
DROP INDEX IF EXISTS idx_sources_last_verified_at;
ALTER TABLE sources DROP COLUMN IF NOT EXISTS last_verified_at;
