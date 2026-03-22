-- Consolidated database schema
-- Source: migrations/001..018

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

CREATE TABLE IF NOT EXISTS grading_settings (
  grade      TEXT PRIMARY KEY CHECK(grade IN ('wrong', 'partial', 'almost', 'correct')),
  points     INTEGER NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO grading_settings (grade, points) VALUES
  ('wrong', 0),
  ('partial', 5),
  ('almost', 15),
  ('correct', 20);

CREATE TABLE IF NOT EXISTS hint_cost_settings (
  level      INTEGER PRIMARY KEY CHECK(level BETWEEN 1 AND 4),
  cost       INTEGER NOT NULL CHECK(cost >= 0),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO hint_cost_settings (level, cost) VALUES
  (1, 0),
  (2, 5),
  (3, 10),
  (4, 15);

CREATE TABLE IF NOT EXISTS finance_settings (
  plan_type   TEXT PRIMARY KEY CHECK(plan_type IN ('fd', 'rd')),
  annual_rate REAL NOT NULL CHECK(annual_rate >= 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO finance_settings (plan_type, annual_rate) VALUES
  ('fd', 8),
  ('rd', 10);

CREATE TABLE IF NOT EXISTS point_investments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type        TEXT    NOT NULL CHECK(plan_type IN ('fd', 'rd')),
  principal_points INTEGER NOT NULL CHECK(principal_points > 0),
  annual_rate      REAL    NOT NULL CHECK(annual_rate >= 0),
  tenure_days      INTEGER NOT NULL CHECK(tenure_days > 0),
  opened_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  maturity_at      TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  closed_at        TEXT,
  interest_points  INTEGER NOT NULL DEFAULT 0,
  payout_points    INTEGER NOT NULL DEFAULT 0,
  recurring_amount INTEGER NOT NULL DEFAULT 0,
  recurring_frequency TEXT,
  recurring_every_days INTEGER NOT NULL DEFAULT 0,
  installments_total INTEGER NOT NULL DEFAULT 1,
  installments_paid INTEGER NOT NULL DEFAULT 1,
  next_installment_at TEXT,
  payout_mode TEXT NOT NULL DEFAULT 'closure',
  payout_every_days INTEGER NOT NULL DEFAULT 0,
  next_payout_at TEXT,
  last_interest_calc_at TEXT,
  accrued_interest_points INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_point_investments_user_status
  ON point_investments (user_id, status, maturity_at);

CREATE TABLE IF NOT EXISTS banking_meta_settings (
  id                    INTEGER PRIMARY KEY CHECK(id = 1),
  credit_annual_rate    REAL    NOT NULL CHECK(credit_annual_rate >= 0),
  default_credit_limit  INTEGER NOT NULL CHECK(default_credit_limit >= 0),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by            INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO banking_meta_settings (id, credit_annual_rate, default_credit_limit) VALUES
  (1, 24, 500);

CREATE TABLE IF NOT EXISTS bank_cards (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_type                TEXT    NOT NULL CHECK(card_type IN ('debit', 'credit')),
  status                   TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending', 'rejected')),
  card_last4               TEXT    NOT NULL,
  credit_limit             INTEGER NOT NULL DEFAULT 0,
  outstanding_balance      INTEGER NOT NULL DEFAULT 0,
  annual_interest_rate     REAL    NOT NULL DEFAULT 0,
  interest_last_applied_at TEXT,
  created_at               TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, card_type)
);

CREATE INDEX IF NOT EXISTS idx_bank_cards_user_type
  ON bank_cards (user_id, card_type);

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
