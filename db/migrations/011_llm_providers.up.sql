-- 011: LLM provider configuration for multi-provider support

CREATE TABLE IF NOT EXISTS llm_providers (
    id              VARCHAR(32) PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    supports_chat   BOOLEAN NOT NULL DEFAULT TRUE,
    supports_embed  BOOLEAN NOT NULL DEFAULT FALSE,
    config_schema   JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO llm_providers (id, name, description, active, supports_chat, supports_embed) VALUES
    ('openrouter', 'OpenRouter', 'OpenRouter unified API gateway', TRUE, TRUE, TRUE),
    ('openai', 'OpenAI', 'OpenAI GPT models', TRUE, TRUE, TRUE),
    ('anthropic', 'Anthropic', 'Anthropic Claude models', TRUE, TRUE, FALSE),
    ('gemini', 'Google Gemini', 'Google Gemini models', TRUE, TRUE, TRUE),
    ('local', 'Local LLM', 'Ollama, llama.cpp, and other local providers', TRUE, TRUE, TRUE),
    ('xai', 'xAI', 'xAI Grok models', TRUE, TRUE, FALSE),
    ('qwen', 'Qwen', 'Qwen models via DashScope', TRUE, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Workspace-level LLM provider configuration
CREATE TABLE IF NOT EXISTS workspace_llm_config (
    workspace_id    UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    default_provider VARCHAR(32) NOT NULL DEFAULT 'openrouter',
    default_model    VARCHAR(255) NOT NULL DEFAULT '',
    embedding_model  VARCHAR(255) NOT NULL DEFAULT '',
    configs         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_llm_default ON workspace_llm_config(default_provider);

-- Track model usage for cost attribution
CREATE TABLE IF NOT EXISTS llm_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider        VARCHAR(32) NOT NULL,
    model           VARCHAR(255) NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_estimate   DECIMAL(10,6) DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_workspace ON llm_usage(workspace_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at);