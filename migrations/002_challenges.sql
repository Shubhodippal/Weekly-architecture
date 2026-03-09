-- Migration: challenges table
CREATE TABLE IF NOT EXISTS challenges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  last_date   TEXT    NOT NULL,               -- ISO date string YYYY-MM-DD
  pdf_key     TEXT    NOT NULL,               -- R2 object key  challenges/<uuid>.pdf
  pdf_name    TEXT    NOT NULL,               -- original filename
  posted_by   INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_challenges_last_date ON challenges (last_date);
