CREATE TABLE IF NOT EXISTS user_challenge_hints (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id   INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  hint_1         TEXT    NOT NULL,
  hint_2         TEXT    NOT NULL,
  hint_3         TEXT    NOT NULL,
  hint_4         TEXT    NOT NULL,
  unlocked_level INTEGER NOT NULL DEFAULT 0 CHECK (unlocked_level BETWEEN 0 AND 4),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_challenge_hints_user
  ON user_challenge_hints (user_id);

CREATE INDEX IF NOT EXISTS idx_user_challenge_hints_challenge
  ON user_challenge_hints (challenge_id);