-- Rename legacy thread tables to assistant

ALTER TABLE IF EXISTS copilot_threads RENAME TO assistant_threads;
ALTER TABLE IF EXISTS copilot_messages RENAME TO assistant_messages;

ALTER INDEX IF EXISTS idx_copilot_threads_workspace_user RENAME TO idx_assistant_threads_workspace_user;
ALTER INDEX IF EXISTS idx_copilot_messages_thread_seq RENAME TO idx_assistant_messages_thread_seq;
