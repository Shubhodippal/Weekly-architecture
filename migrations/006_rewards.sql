-- ── Reward tiers (admin-configurable) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  description      TEXT    DEFAULT '',
  icon             TEXT    DEFAULT '🎁',
  points_required  INTEGER NOT NULL UNIQUE,
  active           INTEGER DEFAULT 1
);

-- ── Per-user unlocked/claimed/fulfilled records ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_rewards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  reward_id    INTEGER NOT NULL,
  status       TEXT    DEFAULT 'unlocked',  -- 'unlocked' | 'claimed' | 'passed' | 'fulfilled'
  unlocked_at  TEXT    DEFAULT (datetime('now')),
  claimed_at   TEXT,
  fulfilled_at TEXT,
  UNIQUE(user_id, reward_id)
);

-- ── Default reward tiers ────────────────────────────────────────────────────
INSERT OR IGNORE INTO rewards (title, description, icon, points_required) VALUES
  ('Blue Lays Big Pack',  'A big pack of Blue Lays — crunch your way to victory!',  '🔵', 100),
  ('Chocolate',           'A sweet chocolate treat for a job well done!',             '🍫', 150),
  ('Shawarma',            'A delicious shawarma wrap on the admin!',                  '🌯', 200),
  ('KFC',                 'Finger lickin'' good KFC treat!',                          '🍗', 300),
  ('Mystery Box',         'A mystery surprise box — nobody knows what is inside!',   '🎁', 400),
  ('Grand Prize',         'The ultimate grand prize chosen by the admin!',            '🏆', 500);
