-- 008: Prompt-injection scanner results on sources.
-- injection_status: clean | flagged (sanitized before indexing) — high-severity
-- sources are refused at ingestion and never reach this table with content.
-- injection_findings: redacted finding list [{pattern_id, category, count, snippet, severity}].

ALTER TABLE sources ADD COLUMN IF NOT EXISTS injection_status VARCHAR(20) NOT NULL DEFAULT 'clean';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS injection_findings JSONB;
CREATE INDEX IF NOT EXISTS idx_sources_injection_status ON sources(workspace_id, injection_status);
