-- Switch credit card interest to monthly compound model.
-- Keep legacy column names but store monthly rate (% per month).

-- If old defaults were still in place, migrate them to the new default: 12% monthly.
UPDATE banking_meta_settings
SET credit_annual_rate = 12,
    updated_at = datetime('now')
WHERE id = 1
  AND ABS(COALESCE(credit_annual_rate, 0) - 24) < 0.0001;

UPDATE bank_cards
SET annual_interest_rate = 12,
    updated_at = datetime('now')
WHERE ABS(COALESCE(annual_interest_rate, 0) - 24) < 0.0001;
