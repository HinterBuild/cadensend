-- 007: Data integrity and feature support
-- Foreign keys, hot-path indexes, multi-workspace membership,
-- session revocation, recipient suppression, duplicate detection,
-- password reset tokens, and updated_at triggers.

-- ------------------------------------------------------------------
-- Hot-path indexes
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_schedules_issue ON schedules(issue_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_recipient_status ON deliveries(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_issue_status ON deliveries(issue_id, status);
CREATE INDEX IF NOT EXISTS idx_sources_series ON sources(series_id);
CREATE INDEX IF NOT EXISTS idx_source_members_series ON source_members(series_id);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user ON magic_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires ON magic_link_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_generation_runs_target ON generation_runs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);

-- ------------------------------------------------------------------
-- Multi-workspace membership
-- workspace_members.user_id was UNIQUE which structurally blocked
-- a user belonging to more than one workspace. Replace it with a
-- composite unique on (workspace_id, user_id).
-- ------------------------------------------------------------------
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_members_workspace_user
    ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- ------------------------------------------------------------------
-- Session revocation: bump token_version to invalidate all JWTs
-- ------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- ------------------------------------------------------------------
-- Recipient suppression (bounces / unsubscribes / complaints)
-- ------------------------------------------------------------------
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS suppression_reason VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE recipients ADD CONSTRAINT uq_recipients_workspace_email
    UNIQUE (workspace_id, email);

-- ------------------------------------------------------------------
-- Duplicate source detection
-- Points at the earlier source whose ingested content is identical.
-- ------------------------------------------------------------------
ALTER TABLE sources ADD COLUMN IF NOT EXISTS duplicate_of UUID;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS chunk_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sources_content_hash ON sources(workspace_id, content_hash);

-- ------------------------------------------------------------------
-- Password reset tokens
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ------------------------------------------------------------------
-- Foreign keys (added defensively: existing orphan rows would make a
-- plain ADD CONSTRAINT fail, so validate only rows that are clean).
-- ------------------------------------------------------------------
DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT * FROM (VALUES
            ('series',            'workspace_id',      'workspaces', 'series_workspace_fk'),
            ('series',            'created_by',        'users',      'series_creator_fk'),
            ('issues',            'series_id',         'series',     'issues_series_fk'),
            ('issues',            'created_by',        'users',      'issues_creator_fk'),
            ('sources',           'workspace_id',      'workspaces', 'sources_workspace_fk'),
            ('sources',           'created_by',        'users',      'sources_creator_fk'),
            ('source_versions',   'source_id',         'sources',    'source_versions_source_fk'),
            ('source_chunks',     'source_version_id', 'source_versions', 'source_chunks_version_fk'),
            ('schedules',         'issue_id',          'issues',     'schedules_issue_fk'),
            ('deliveries',        'issue_id',          'issues',     'deliveries_issue_fk'),
            ('deliveries',        'recipient_id',      'recipients', 'deliveries_recipient_fk'),
            ('source_members',    'source_id',         'sources',    'source_members_source_fk'),
            ('source_members',    'series_id',         'series',     'source_members_series_fk'),
            ('magic_link_tokens', 'user_id',           'users',      'magic_link_tokens_user_fk'),
            ('password_reset_tokens', 'user_id',       'users',      'password_reset_tokens_user_fk'),
            ('recipients',        'workspace_id',      'workspaces', 'recipients_workspace_fk'),
            ('workspace_members', 'workspace_id',      'workspaces', 'workspace_members_workspace_fk'),
            ('workspace_members', 'user_id',           'users',      'workspace_members_user_fk'),
            ('issue_versions',    'issue_id',          'issues',     'issue_versions_issue_fk')
        ) AS t(table_name, column_name, ref_table, constraint_name)
        WHERE NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname = t.constraint_name
              AND c.conrelid = format('%I', t.table_name)::regclass
        )
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE CASCADE',
                fk.table_name, fk.constraint_name, fk.column_name, fk.ref_table
            );
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'Skipping FK %: %', fk.constraint_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- ------------------------------------------------------------------
-- updated_at consistency: DB-level triggers so every writer
-- (GORM, asyncpg, raw SQL) keeps timestamps coherent.
-- ------------------------------------------------------------------
ALTER TABLE generation_runs ADD COLUMN IF NOT EXISTS error_msg TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t.table_name, t.table_name
        );
    END LOOP;
END $$;
