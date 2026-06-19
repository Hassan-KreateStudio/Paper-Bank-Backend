CREATE TABLE auth_challenges_new (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT,
  admission_number TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  verification_code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

INSERT INTO auth_challenges_new (
  id,
  institution_id,
  student_id,
  admission_number,
  email,
  full_name,
  verification_code_hash,
  status,
  expires_at,
  consumed_at,
  created_at
)
SELECT
  id,
  institution_id,
  student_id,
  admission_number,
  email,
  '',
  verification_code_hash,
  status,
  expires_at,
  consumed_at,
  created_at
FROM auth_challenges;

DROP TABLE auth_challenges;

ALTER TABLE auth_challenges_new RENAME TO auth_challenges;
