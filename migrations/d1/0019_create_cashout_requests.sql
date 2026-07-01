CREATE TABLE IF NOT EXISTS cashout_requests (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  approved_upload_count_snapshot INTEGER NOT NULL,
  amount_kes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready', 'requested', 'approved', 'paid', 'cancelled')),
  mpesa_phone_number TEXT,
  requested_at TEXT,
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_cashout_requests_student_status
ON cashout_requests (student_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_cashout_requests_institution_status
ON cashout_requests (institution_id, status, created_at);
