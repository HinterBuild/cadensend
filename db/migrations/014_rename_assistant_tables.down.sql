ALTER INDEX IF EXISTS idx_assistant_messages_thread_seq RENAME TO idx_copilot_messages_thread_seq;
ALTER INDEX IF EXISTS idx_assistant_threads_workspace_user RENAME TO idx_copilot_threads_workspace_user;

ALTER TABLE IF EXISTS assistant_messages RENAME TO copilot_messages;
ALTER TABLE IF EXISTS assistant_threads RENAME TO copilot_threads;
