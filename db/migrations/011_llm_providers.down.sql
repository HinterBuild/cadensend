-- Rollback for 011: LLM provider configuration for multi-provider support

DROP TABLE IF EXISTS llm_usage;
DROP TABLE IF EXISTS workspace_llm_config;
DROP TABLE IF EXISTS llm_providers;