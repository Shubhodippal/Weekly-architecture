ALTER TABLE challenges ADD COLUMN publish_at TEXT;

UPDATE challenges
SET publish_at = COALESCE(publish_at, created_at)
WHERE publish_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_challenges_publish_at ON challenges(publish_at);
