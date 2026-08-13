-- Add optional OpenRouter model preference per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_model VARCHAR(255) NOT NULL DEFAULT '';
