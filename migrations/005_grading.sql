-- Add grading columns to submissions
ALTER TABLE submissions ADD COLUMN grade TEXT;        -- 'wrong' | 'partial' | 'almost' | 'correct' | 'not_attempted'
ALTER TABLE submissions ADD COLUMN remark TEXT;
ALTER TABLE submissions ADD COLUMN points INTEGER DEFAULT 5;
ALTER TABLE submissions ADD COLUMN evaluated_at TEXT;
