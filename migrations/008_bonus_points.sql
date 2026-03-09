-- Admin bonus points granted outside of challenges
CREATE TABLE IF NOT EXISTS bonus_points (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points     INTEGER NOT NULL,
  reason     TEXT    DEFAULT 'Admin bonus',
  granted_by INTEGER REFERENCES users(id),
  granted_at TEXT    DEFAULT (datetime('now'))
);
