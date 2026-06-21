ALTER TABLE papers ADD COLUMN extracted_text TEXT;

CREATE TABLE IF NOT EXISTS paper_search_chunks (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (paper_id) REFERENCES papers(id),
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_search_chunks_paper_id
ON paper_search_chunks (paper_id);

CREATE INDEX IF NOT EXISTS idx_paper_search_chunks_institution_id
ON paper_search_chunks (institution_id);
