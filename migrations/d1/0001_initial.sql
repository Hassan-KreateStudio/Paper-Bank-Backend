-- Initial multi-institution schema.
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  admission_number TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (institution_id, admission_number),
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);
