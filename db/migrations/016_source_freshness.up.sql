-- 016: Track when a source's content was last successfully verified/indexed,
-- independent of updated_at (which also changes on unrelated edits/renames).
-- Staleness itself is computed by the application against a default window;
-- this column only records the fact.

ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_sources_last_verified_at ON sources(workspace_id, last_verified_at);
