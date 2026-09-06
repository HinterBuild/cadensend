-- User-defined series voices and goal presets
ALTER TABLE users ADD COLUMN IF NOT EXISTS content_preferences JSONB NOT NULL DEFAULT '{}';
