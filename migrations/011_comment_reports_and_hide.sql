ALTER TABLE challenge_comments ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_comments ADD COLUMN hidden_reason TEXT;
ALTER TABLE challenge_comments ADD COLUMN hidden_by INTEGER REFERENCES users(id);
ALTER TABLE challenge_comments ADD COLUMN hidden_at TEXT;

CREATE TABLE IF NOT EXISTS comment_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES challenge_comments(id) ON DELETE CASCADE,
  reported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(comment_id, reported_by)
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_reported_by ON comment_reports(reported_by);
