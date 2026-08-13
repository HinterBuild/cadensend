ALTER TABLE sources ADD COLUMN IF NOT EXISTS series_id UUID;
CREATE INDEX IF NOT EXISTS idx_sources_series ON sources(series_id);
