DROP INDEX IF EXISTS idx_sources_series;
ALTER TABLE sources DROP COLUMN IF EXISTS series_id;
