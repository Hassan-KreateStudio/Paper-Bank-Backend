CREATE TABLE IF NOT EXISTS upload_submissions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  title TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  paper_type TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  description TEXT,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_upload_submissions_institution_id
ON upload_submissions (institution_id);

CREATE INDEX IF NOT EXISTS idx_upload_submissions_student_id
ON upload_submissions (student_id);

CREATE INDEX IF NOT EXISTS idx_upload_submissions_status
ON upload_submissions (status);

CREATE INDEX IF NOT EXISTS idx_upload_submissions_file_hash
ON upload_submissions (file_hash);
