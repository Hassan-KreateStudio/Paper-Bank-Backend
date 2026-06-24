-- Store institution-specific upload review standards in the institution record.
ALTER TABLE institutions ADD COLUMN upload_review_prompt TEXT;
