-- 009: Platform extensions — skills, connectors, insights, workflows, editorial

-- Unified catalog for builtin skills, connectors, workflow modes, and insight types
CREATE TABLE IF NOT EXISTS platform_catalog (
    id          VARCHAR(64) PRIMARY KEY,
    kind        VARCHAR(32) NOT NULL CHECK (kind IN ('skill', 'connector', 'workflow', 'insight', 'editorial')),
    name        VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category    VARCHAR(64) NOT NULL DEFAULT '',
    metadata    JSONB NOT NULL DEFAULT '{}',
    version     VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_kind ON platform_catalog(kind);

-- Per-workspace enablement and configuration overrides
CREATE TABLE IF NOT EXISTS workspace_platform_config (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    catalog_id    VARCHAR(64) NOT NULL REFERENCES platform_catalog(id) ON DELETE CASCADE,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    config        JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_platform_config_ws ON workspace_platform_config(workspace_id);

-- Connector sync runs (unified connector service)
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
CREATE INDEX IF NOT EXISTS idx_connector_sync_runs_ws ON connector_sync_runs(workspace_id, started_at DESC);

-- Persisted insight snapshots (20 insight types)
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
CREATE INDEX IF NOT EXISTS idx_insight_snapshots_ws ON insight_snapshots(workspace_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_snapshots_type ON insight_snapshots(workspace_id, insight_type);

-- Workflow runs and step telemetry
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
CREATE INDEX IF NOT EXISTS idx_workflow_runs_ws ON workflow_runs(workspace_id, started_at DESC);

-- Editorial assets: prompt blocks, outlines, comments, style guides, benchmarks, plugins
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
CREATE INDEX IF NOT EXISTS idx_editorial_assets_ws ON editorial_assets(workspace_id, asset_type);

-- Evaluation harness results
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_type   VARCHAR(32) NOT NULL,
    target_id     UUID NOT NULL,
    rubric        JSONB NOT NULL DEFAULT '{}',
    scores        JSONB NOT NULL DEFAULT '{}',
    passed        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contributor badges for published skills, connectors, workflows
CREATE TABLE IF NOT EXISTS contributor_badges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_type    VARCHAR(64) NOT NULL,
    catalog_id    VARCHAR(64),
    awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata      JSONB NOT NULL DEFAULT '{}'
);

-- Series platform settings
ALTER TABLE series ADD COLUMN IF NOT EXISTS skill_id VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE series ADD COLUMN IF NOT EXISTS workflow_mode VARCHAR(64) NOT NULL DEFAULT 'default';

-- Plugin packages (community installable modules)
CREATE TABLE IF NOT EXISTS plugin_packages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          VARCHAR(128) NOT NULL UNIQUE,
    name          VARCHAR(256) NOT NULL,
    version       VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    manifest      JSONB NOT NULL DEFAULT '{}',
    published_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    downloads     INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
