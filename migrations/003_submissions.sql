-- Submissions: one per user per challenge (upsert pattern)
CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  solution_text TEXT,
  file_key     TEXT,
  file_name    TEXT,
  file_type    TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(challenge_id, user_id)
);
