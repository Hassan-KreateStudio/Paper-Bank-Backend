CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  institution_id TEXT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_users_institution_id
ON staff_users (institution_id);

CREATE INDEX IF NOT EXISTS idx_staff_users_role
ON staff_users (role);

