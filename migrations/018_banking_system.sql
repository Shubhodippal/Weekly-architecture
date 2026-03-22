-- Banking system: debit/credit cards + dynamic investment behavior

CREATE TABLE IF NOT EXISTS banking_meta_settings (
  id                    INTEGER PRIMARY KEY CHECK(id = 1),
  credit_annual_rate    REAL    NOT NULL CHECK(credit_annual_rate >= 0),
  default_credit_limit  INTEGER NOT NULL CHECK(default_credit_limit >= 0),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by            INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO banking_meta_settings
  (id, credit_annual_rate, default_credit_limit, updated_at)
VALUES
  (1, 24, 500, datetime('now'));

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

ALTER TABLE point_investments ADD COLUMN recurring_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE point_investments ADD COLUMN recurring_frequency TEXT;
ALTER TABLE point_investments ADD COLUMN recurring_every_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE point_investments ADD COLUMN installments_total INTEGER NOT NULL DEFAULT 1;
ALTER TABLE point_investments ADD COLUMN installments_paid INTEGER NOT NULL DEFAULT 1;
ALTER TABLE point_investments ADD COLUMN next_installment_at TEXT;
ALTER TABLE point_investments ADD COLUMN payout_mode TEXT NOT NULL DEFAULT 'closure';
ALTER TABLE point_investments ADD COLUMN payout_every_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE point_investments ADD COLUMN next_payout_at TEXT;
ALTER TABLE point_investments ADD COLUMN last_interest_calc_at TEXT;
ALTER TABLE point_investments ADD COLUMN accrued_interest_points INTEGER NOT NULL DEFAULT 0;

UPDATE point_investments
SET recurring_amount = COALESCE(recurring_amount, 0),
    recurring_every_days = COALESCE(recurring_every_days, 0),
    installments_total = CASE WHEN COALESCE(installments_total, 0) < 1 THEN 1 ELSE installments_total END,
    installments_paid = CASE WHEN COALESCE(installments_paid, 0) < 1 THEN 1 ELSE installments_paid END,
    payout_mode = COALESCE(NULLIF(payout_mode, ''), 'closure'),
    payout_every_days = COALESCE(payout_every_days, 0),
    last_interest_calc_at = COALESCE(last_interest_calc_at, opened_at),
    accrued_interest_points = COALESCE(accrued_interest_points, 0);
