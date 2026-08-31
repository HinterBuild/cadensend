-- 010: Workspace email provider configuration (user-selectable send inbox)

CREATE TABLE IF NOT EXISTS workspace_email_config (
    workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    provider      VARCHAR(32) NOT NULL DEFAULT 'brevo',
    from_email    VARCHAR(255) NOT NULL DEFAULT '',
    from_name     VARCHAR(255) NOT NULL DEFAULT '',
    config        JSONB NOT NULL DEFAULT '{}',
    verified      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure platform tables from 009 exist (idempotent)
CREATE TABLE IF NOT EXISTS platform_catalog (
    id          VARCHAR(64) PRIMARY KEY,
    kind        VARCHAR(32) NOT NULL,
    name        VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category    VARCHAR(64) NOT NULL DEFAULT '',
    metadata    JSONB NOT NULL DEFAULT '{}',
    version     VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_platform_config (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    catalog_id    VARCHAR(64) NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    config        JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, catalog_id)
);

CREATE TABLE IF NOT EXISTS connector_sync_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_id    VARCHAR(64) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    items_fetched   INTEGER NOT NULL DEFAULT 0,
    items_ingested  INTEGER NOT NULL DEFAULT 0,
    error           TEXT NOT NULL DEFAULT '',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS insight_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    series_id     UUID REFERENCES series(id) ON DELETE SET NULL,
    issue_id      UUID REFERENCES issues(id) ON DELETE SET NULL,
    insight_type  VARCHAR(64) NOT NULL,
    severity      VARCHAR(16) NOT NULL DEFAULT 'info',
    score         DOUBLE PRECISION,
    title         VARCHAR(256) NOT NULL,
    detail        TEXT NOT NULL DEFAULT '',
    payload       JSONB NOT NULL DEFAULT '{}',
    computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    series_id       UUID REFERENCES series(id) ON DELETE SET NULL,
    issue_id        UUID REFERENCES issues(id) ON DELETE SET NULL,
    workflow_id     VARCHAR(64) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'running',
    mode            VARCHAR(64) NOT NULL DEFAULT 'default',
    steps           JSONB NOT NULL DEFAULT '[]',
    result          JSONB NOT NULL DEFAULT '{}',
    error           TEXT NOT NULL DEFAULT '',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS editorial_assets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    series_id     UUID REFERENCES series(id) ON DELETE SET NULL,
    issue_id      UUID REFERENCES issues(id) ON DELETE SET NULL,
    asset_type    VARCHAR(64) NOT NULL,
    name          VARCHAR(256) NOT NULL DEFAULT '',
    data          JSONB NOT NULL DEFAULT '{}',
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE series ADD COLUMN IF NOT EXISTS skill_id VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE series ADD COLUMN IF NOT EXISTS workflow_mode VARCHAR(64) NOT NULL DEFAULT 'default';
