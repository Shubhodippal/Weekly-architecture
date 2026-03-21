-- Consolidated database schema
-- Source: migrations/001..013

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- Users & Auth
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  email       TEXT    UNIQUE NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'user',
  last_login  TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  otp_hash   TEXT    NOT NULL,
  created_at TEXT    DEFAULT (datetime('now')),
  used       INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps (email, used);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Optional bootstrap: promote known admin account if present
UPDATE users SET role = 'admin' WHERE email = 'shubhodippal01@gmail.com';

-- ─────────────────────────────────────────────────────────────────────────────
-- Challenges
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title               TEXT    NOT NULL,
  description         TEXT,
  last_date           TEXT    NOT NULL, -- YYYY-MM-DD
  pdf_key             TEXT    NOT NULL,
  pdf_name            TEXT    NOT NULL,
  posted_by           INTEGER NOT NULL REFERENCES users(id),
  created_at          TEXT    DEFAULT (datetime('now')),
  answer_description  TEXT,
  answer_key          TEXT,
  answer_name         TEXT,
  publish_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_challenges_last_date ON challenges (last_date);
CREATE INDEX IF NOT EXISTS idx_challenges_publish_at ON challenges (publish_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Submissions & Grading
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  solution_text TEXT,
  file_key      TEXT,
  file_name     TEXT,
  file_type     TEXT,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  grade         TEXT,
  remark        TEXT,
  points        INTEGER DEFAULT 5,
  evaluated_at  TEXT,
  UNIQUE(challenge_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rewards & Points
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  description      TEXT    DEFAULT '',
  icon             TEXT    DEFAULT '🎁',
  points_required  INTEGER NOT NULL UNIQUE,
  active           INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_rewards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  reward_id       INTEGER NOT NULL,
  status          TEXT    DEFAULT 'unlocked', -- unlocked | claimed | passed | fulfilled
  unlocked_at     TEXT    DEFAULT (datetime('now')),
  claimed_at      TEXT,
  fulfilled_at    TEXT,
  points_consumed INTEGER DEFAULT 0,
  UNIQUE(user_id, reward_id)
);

CREATE TABLE IF NOT EXISTS bonus_points (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points     INTEGER NOT NULL,
  reason     TEXT    DEFAULT 'Admin bonus',
  granted_by INTEGER REFERENCES users(id),
  granted_at TEXT    DEFAULT (datetime('now'))
);

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

INSERT OR IGNORE INTO rewards (title, description, icon, points_required) VALUES
  ('Blue Lays Big Pack', 'A big pack of Blue Lays — crunch your way to victory!', '🔵', 100),
  ('Chocolate',          'A sweet chocolate treat for a job well done!',            '🍫', 150),
  ('Shawarma',           'A delicious shawarma wrap on the admin!',                 '🌯', 200),
  ('KFC',                'Finger lickin'' good KFC treat!',                         '🍗', 300),
  ('Mystery Box',        'A mystery surprise box — nobody knows what is inside!',  '🎁', 400),
  ('Grand Prize',        'The ultimate grand prize chosen by the admin!',           '🏆', 500);

-- ─────────────────────────────────────────────────────────────────────────────
-- Comments, Reactions, Reports, Moderation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES challenge_comments(id) ON DELETE CASCADE,
  content       TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  is_pinned     INTEGER NOT NULL DEFAULT 0,
  is_hidden     INTEGER NOT NULL DEFAULT 0,
  hidden_reason TEXT,
  hidden_by     INTEGER REFERENCES users(id),
  hidden_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_challenge_created
  ON challenge_comments (challenge_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON challenge_comments (parent_id);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id  INTEGER NOT NULL REFERENCES challenge_comments(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction    TEXT    NOT NULL CHECK(reaction IN ('like', 'dislike')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
  ON comment_reactions (comment_id);

CREATE TABLE IF NOT EXISTS comment_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id  INTEGER NOT NULL REFERENCES challenge_comments(id) ON DELETE CASCADE,
  reported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(comment_id, reported_by)
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_reported_by ON comment_reports(reported_by);
