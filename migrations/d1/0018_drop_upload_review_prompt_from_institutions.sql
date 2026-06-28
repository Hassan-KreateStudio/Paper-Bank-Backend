-- Upload review prompts now live in code, not in the database.
ALTER TABLE institutions DROP COLUMN upload_review_prompt;
