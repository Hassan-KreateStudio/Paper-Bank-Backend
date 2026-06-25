CREATE TABLE IF NOT EXISTS staff_invites (
  id TEXT PRIMARY KEY,
  institution_id TEXT,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  invite_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  invited_by_staff_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (invited_by_staff_user_id) REFERENCES staff_users(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_email
ON staff_invites (email);

CREATE INDEX IF NOT EXISTS idx_staff_invites_username
ON staff_invites (username);

