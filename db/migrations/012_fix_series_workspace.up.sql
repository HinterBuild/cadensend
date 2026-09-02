-- Fix series rows created with workspace_id = user id instead of workspace id.
UPDATE series s
SET workspace_id = u.workspace_id,
    updated_at = NOW()
FROM users u
WHERE s.created_by = u.id
  AND s.workspace_id = u.id
  AND s.workspace_id IS DISTINCT FROM u.workspace_id;
