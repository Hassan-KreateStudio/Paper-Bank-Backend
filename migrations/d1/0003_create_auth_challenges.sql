CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  admission_number TEXT NOT NULL,
  email TEXT NOT NULL,
  verification_code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
