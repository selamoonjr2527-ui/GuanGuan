CREATE TABLE IF NOT EXISTS member_push_tokens (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  token TEXT NOT NULL,
  auth_uid TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_member_push_tokens_member_id
ON member_push_tokens(member_id);
