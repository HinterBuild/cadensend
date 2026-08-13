ALTER TABLE issues DROP COLUMN IF EXISTS content_json;
ALTER TABLE issues DROP COLUMN IF EXISTS generate_error;
ALTER TABLE sources DROP COLUMN IF EXISTS ingest_error;
