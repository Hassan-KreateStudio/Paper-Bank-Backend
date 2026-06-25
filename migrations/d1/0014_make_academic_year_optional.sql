PRAGMA foreign_keys = OFF;

CREATE TABLE upload_submissions_new (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  title TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  paper_type TEXT NOT NULL,
  academic_year TEXT,
  description TEXT,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  model_label TEXT,
  model_confidence REAL,
  model_metadata_json TEXT,
  reviewed_by_model_at TEXT,
  document_fingerprint TEXT,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

INSERT INTO upload_submissions_new (
  id,
  institution_id,
  student_id,
  title,
  unit_code,
  unit_name,
  paper_type,
  academic_year,
  description,
  file_key,
  file_name,
  mime_type,
  file_size_bytes,
  file_hash,
  status,
  created_at,
  updated_at,
  model_label,
  model_confidence,
  model_metadata_json,
  reviewed_by_model_at,
  document_fingerprint
)
SELECT
  id,
  institution_id,
  student_id,
  title,
  unit_code,
  unit_name,
  paper_type,
  academic_year,
  description,
  file_key,
  file_name,
  mime_type,
  file_size_bytes,
  file_hash,
  status,
  created_at,
  updated_at,
  model_label,
  model_confidence,
  model_metadata_json,
  reviewed_by_model_at,
  document_fingerprint
FROM upload_submissions;

DROP TABLE upload_submissions;
ALTER TABLE upload_submissions_new RENAME TO upload_submissions;

CREATE INDEX idx_upload_submissions_institution_id
ON upload_submissions (institution_id);

CREATE INDEX idx_upload_submissions_student_id
ON upload_submissions (student_id);

CREATE INDEX idx_upload_submissions_status
ON upload_submissions (status);

CREATE INDEX idx_upload_submissions_file_hash
ON upload_submissions (file_hash);

CREATE INDEX idx_upload_submissions_institution_fingerprint
ON upload_submissions (institution_id, document_fingerprint);

CREATE TABLE papers_new (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  source_upload_submission_id TEXT,
  title TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  paper_type TEXT NOT NULL,
  academic_year TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  file_key TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  extracted_text TEXT,
  document_fingerprint TEXT,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (source_upload_submission_id) REFERENCES upload_submissions(id)
);

INSERT INTO papers_new (
  id,
  institution_id,
  source_upload_submission_id,
  title,
  unit_code,
  unit_name,
  paper_type,
  academic_year,
  status,
  file_key,
  file_hash,
  created_at,
  updated_at,
  extracted_text,
  document_fingerprint
)
SELECT
  id,
  institution_id,
  source_upload_submission_id,
  title,
  unit_code,
  unit_name,
  paper_type,
  academic_year,
  status,
  file_key,
  file_hash,
  created_at,
  updated_at,
  extracted_text,
  document_fingerprint
FROM papers;

DROP TABLE papers;
ALTER TABLE papers_new RENAME TO papers;

CREATE INDEX idx_papers_institution_id
ON papers (institution_id);

CREATE INDEX idx_papers_status
ON papers (status);

CREATE INDEX idx_papers_unit_code
ON papers (unit_code);

CREATE INDEX idx_papers_file_hash
ON papers (file_hash);

CREATE INDEX idx_papers_institution_fingerprint
ON papers (institution_id, document_fingerprint);

PRAGMA foreign_keys = ON;
