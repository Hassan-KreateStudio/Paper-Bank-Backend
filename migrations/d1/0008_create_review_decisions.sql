CREATE TABLE IF NOT EXISTS review_decisions (
  id TEXT PRIMARY KEY,
  upload_submission_id TEXT NOT NULL,
  reviewer_student_id TEXT,
  decision TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (upload_submission_id) REFERENCES upload_submissions(id),
  FOREIGN KEY (reviewer_student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_review_decisions_upload_submission_id
ON review_decisions (upload_submission_id);

CREATE INDEX IF NOT EXISTS idx_review_decisions_decision
ON review_decisions (decision);
