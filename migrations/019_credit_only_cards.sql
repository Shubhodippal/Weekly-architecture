-- Remove debit-card model and keep only credit cards (used for borrowing points).

DROP TABLE IF EXISTS bank_cards_new;

CREATE TABLE bank_cards_new (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_type                TEXT    NOT NULL DEFAULT 'credit' CHECK(card_type = 'credit'),
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

INSERT INTO bank_cards_new (
  id,
  user_id,
  card_type,
  status,
  card_last4,
  credit_limit,
  outstanding_balance,
  annual_interest_rate,
  interest_last_applied_at,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  'credit',
  status,
  card_last4,
  credit_limit,
  outstanding_balance,
  annual_interest_rate,
  interest_last_applied_at,
  created_at,
  updated_at
FROM bank_cards
WHERE card_type = 'credit';

DROP TABLE bank_cards;
ALTER TABLE bank_cards_new RENAME TO bank_cards;

CREATE INDEX IF NOT EXISTS idx_bank_cards_user_type
  ON bank_cards (user_id, card_type);
