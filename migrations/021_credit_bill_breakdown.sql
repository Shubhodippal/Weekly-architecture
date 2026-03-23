-- Track credit bill breakdown and key credit timestamps.
-- Keeps legacy outstanding_balance while adding principal/interest split.

ALTER TABLE bank_cards ADD COLUMN principal_outstanding INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_cards ADD COLUMN interest_outstanding INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_cards ADD COLUMN last_borrowed_at TEXT;
ALTER TABLE bank_cards ADD COLUMN last_payment_at TEXT;

-- Backfill existing rows: treat previous outstanding as principal if split was absent.
UPDATE bank_cards
SET interest_outstanding = COALESCE(interest_outstanding, 0),
    principal_outstanding = CASE
      WHEN COALESCE(principal_outstanding, 0) <= 0
           AND COALESCE(interest_outstanding, 0) <= 0
           AND COALESCE(outstanding_balance, 0) > 0
        THEN COALESCE(outstanding_balance, 0)
      ELSE COALESCE(principal_outstanding, 0)
    END;

UPDATE bank_cards
SET outstanding_balance = COALESCE(principal_outstanding, 0) + COALESCE(interest_outstanding, 0)
WHERE COALESCE(principal_outstanding, 0) + COALESCE(interest_outstanding, 0) > 0;
