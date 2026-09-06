-- Copilot conversation persistence

CREATE TABLE IF NOT EXISTS copilot_threads (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id      UUID NOT NULL,
    title        VARCHAR(255) NOT NULL DEFAULT 'New conversation',
    agent        VARCHAR(32) NOT NULL DEFAULT 'operator',
    model        VARCHAR(255) NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_threads_workspace_user
    ON copilot_threads(workspace_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
    id         VARCHAR(64) PRIMARY KEY,
    thread_id  UUID NOT NULL REFERENCES copilot_threads(id) ON DELETE CASCADE,
    role       VARCHAR(16) NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    metadata   JSONB NOT NULL DEFAULT '{}',
    sequence   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread_seq
    ON copilot_messages(thread_id, sequence);
