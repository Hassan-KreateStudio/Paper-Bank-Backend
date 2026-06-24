ALTER TABLE upload_submissions
ADD COLUMN model_label TEXT;

ALTER TABLE upload_submissions
ADD COLUMN model_confidence REAL;

ALTER TABLE upload_submissions
ADD COLUMN model_metadata_json TEXT;

ALTER TABLE upload_submissions
ADD COLUMN reviewed_by_model_at TEXT;

ALTER TABLE upload_submissions
ADD COLUMN document_fingerprint TEXT;

ALTER TABLE papers
ADD COLUMN document_fingerprint TEXT;

CREATE INDEX idx_upload_submissions_institution_fingerprint
ON upload_submissions (institution_id, document_fingerprint);

CREATE INDEX idx_papers_institution_fingerprint
ON papers (institution_id, document_fingerprint);
