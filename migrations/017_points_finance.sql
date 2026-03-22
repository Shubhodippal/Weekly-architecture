-- Points Finance: FD/RD rates and user investments

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
  payout_points    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_point_investments_user_status
  ON point_investments (user_id, status, maturity_at);
