CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  academic_year TEXT,
  paper_type TEXT NOT NULL,
  storage_key TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE INDEX IF NOT EXISTS idx_papers_institution_unit
ON papers (institution_id, unit_code);
