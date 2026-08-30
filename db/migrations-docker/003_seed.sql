-- Seed data for development
-- Inserts a test workspace and user for login testing

INSERT INTO workspaces (id, name, plan, status, created_by, created_at, updated_at)
VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Default Workspace', 'pro', 'active', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (id, email, password_hash, name, timezone, status, workspace_id, created_at, updated_at, email_verified)
VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'demo@example.com',
  NULL,
  'Demo User',
  'Asia/Karachi',
  'active',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  NOW(),
  NOW(),
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'admin', NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

-- Insert a sample series for the workspace
INSERT INTO series (id, workspace_id, slug, topic, goal, level, timezone, status, created_by, created_at, updated_at)
VALUES (
  'c3d4e5f6-a7b8-9012-cdef-123456789012',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'intro-to-kubernetes',
  'Introduction to Kubernetes',
  'Learn Kubernetes fundamentals from scratch',
  'beginner',
  'UTC',
  'active',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;
