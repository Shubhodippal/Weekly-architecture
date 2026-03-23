-- Lock reward claims once credit limit is fully exhausted.
-- Unlock only after the full outstanding bill is cleared.

ALTER TABLE bank_cards ADD COLUMN reward_claim_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_cards ADD COLUMN reward_claim_blocked_at TEXT;

-- If there is no outstanding bill, claim lock must be off.
UPDATE bank_cards
SET reward_claim_blocked = 0,
    reward_claim_blocked_at = NULL
WHERE COALESCE(outstanding_balance, 0) <= 0;

-- Existing rows currently at/above limit are treated as exhausted.
UPDATE bank_cards
SET reward_claim_blocked = 1,
    reward_claim_blocked_at = COALESCE(
      reward_claim_blocked_at,
      COALESCE(updated_at, created_at, datetime('now'))
    )
WHERE COALESCE(credit_limit, 0) > 0
  AND COALESCE(outstanding_balance, 0) >= COALESCE(credit_limit, 0)
  AND COALESCE(outstanding_balance, 0) > 0;
