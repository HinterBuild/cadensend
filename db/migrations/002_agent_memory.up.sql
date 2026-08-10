-- Agent memory and context tables for LangGraph workflow
CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE (namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_namespace ON agent_memories(namespace);
CREATE INDEX IF NOT EXISTS idx_agent_memories_key ON agent_memories(key);

-- Short-term memory: checkpoint stores for LangGraph threads
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
    thread_id TEXT NOT NULL,
    thread_ts TEXT NOT NULL,
    parent_ts TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (thread_id, thread_ts)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON langgraph_checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_ts ON langgraph_checkpoints(thread_ts);
