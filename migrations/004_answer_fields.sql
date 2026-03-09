-- Migration: add answer fields to challenges table
ALTER TABLE challenges ADD COLUMN answer_description TEXT;
ALTER TABLE challenges ADD COLUMN answer_key          TEXT;    -- R2 key for the answer PDF
ALTER TABLE challenges ADD COLUMN answer_name         TEXT;    -- original filename of answer PDF
