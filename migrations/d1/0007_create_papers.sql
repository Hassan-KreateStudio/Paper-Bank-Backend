CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  source_upload_submission_id TEXT,
  title TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  paper_type TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  file_key TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (source_upload_submission_id) REFERENCES upload_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_papers_institution_id
ON papers (institution_id);

CREATE INDEX IF NOT EXISTS idx_papers_status
ON papers (status);

CREATE INDEX IF NOT EXISTS idx_papers_unit_code
ON papers (unit_code);

CREATE INDEX IF NOT EXISTS idx_papers_file_hash
ON papers (file_hash);
