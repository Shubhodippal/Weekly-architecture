-- Migration: challenge comments (YouTube-style threads)
CREATE TABLE IF NOT EXISTS challenge_comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES challenge_comments(id) ON DELETE CASCADE,
  content      TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_challenge_created
  ON challenge_comments (challenge_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON challenge_comments (parent_id);
