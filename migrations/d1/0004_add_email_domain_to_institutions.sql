ALTER TABLE institutions
ADD COLUMN email_domain TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_email_domain
ON institutions (email_domain);
