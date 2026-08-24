-- 007 rollback: remove triggers, FKs, and feature columns added in 007.

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'updated_at'
          AND table_name IN (
            'users', 'workspaces', 'workspace_members', 'series', 'series_versions',
            'issues', 'issue_versions', 'sources', 'source_versions', 'source_chunks',
            'ingestion_runs', 'embedding_indexes', 'generation_runs', 'assets',
            'schedules', 'deliveries', 'outbox_events', 'recipients'
          )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t.table_name, t.table_name);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS password_reset_tokens;
ALTER TABLE recipients DROP CONSTRAINT IF EXISTS uq_recipients_workspace_email;

DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT constraint_name FROM pg_constraint
        WHERE constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%_fk'
          AND conrelid::regclass::text IN (
            'series', 'issues', 'sources', 'source_versions', 'source_chunks',
            'schedules', 'deliveries', 'source_members', 'magic_link_tokens',
            'password_reset_tokens', 'recipients', 'workspace_members', 'issue_versions'
          )
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I',
            (SELECT conrelid::regclass::text FROM pg_constraint WHERE constraint_name = fk.constraint_name),
            fk.constraint_name);
    END LOOP;
END $$;

DROP INDEX IF EXISTS idx_audit_logs_actor;
DROP INDEX IF EXISTS idx_audit_logs_target;
DROP INDEX IF EXISTS idx_generation_runs_target;
DROP INDEX IF EXISTS idx_magic_link_tokens_expires;
DROP INDEX IF EXISTS idx_magic_link_tokens_user;
DROP INDEX IF EXISTS idx_source_members_series;
DROP INDEX IF EXISTS idx_sources_series;
DROP INDEX IF EXISTS idx_deliveries_issue_status;
DROP INDEX IF EXISTS idx_deliveries_recipient_status;
DROP INDEX IF EXISTS idx_schedules_issue;
DROP INDEX IF EXISTS idx_sources_content_hash;
DROP INDEX IF EXISTS idx_password_reset_tokens_expires;
DROP INDEX IF EXISTS idx_password_reset_tokens_user;
DROP INDEX IF EXISTS idx_workspace_members_user;
ALTER TABLE sources DROP COLUMN IF EXISTS duplicate_of;
ALTER TABLE sources DROP COLUMN IF EXISTS chunk_count;
ALTER TABLE users DROP COLUMN IF EXISTS token_version;
ALTER TABLE recipients DROP COLUMN IF EXISTS suppressed;
ALTER TABLE recipients DROP COLUMN IF EXISTS suppression_reason;
ALTER TABLE recipients DROP COLUMN IF EXISTS verified_at;
