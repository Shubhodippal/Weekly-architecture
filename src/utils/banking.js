import { ensurePointsFinanceTables, getFinanceRates, getUserNetPoints, toIsoUtc } from "./pointsFinance.js";

export const PAYOUT_MODES = ["monthly", "quarterly", "yearly", "closure", "reinvest"];
export const RD_FREQUENCIES = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export const DEFAULT_BANKING_META = {
  credit_annual_rate: 12,
  credit_monthly_rate: 12,
  default_credit_limit: 500,
};

const DAY_MS = 86400000;

function utcDayStartMs(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isOnOrAfterUtcDay(nowDate, dueDate) {
  return utcDayStartMs(nowDate) >= utcDayStartMs(dueDate);
}

function elapsedUtcDays(fromDate, toDate) {
  return Math.max(0, Math.floor((utcDayStartMs(toDate) - utcDayStartMs(fromDate)) / DAY_MS));
}

function addUtcDaysFromStart(date, days) {
  return new Date(utcDayStartMs(date) + days * DAY_MS);
}

function parseDbDate(value, fallback = null) {
  if (!value) return fallback;
  const iso = toIsoUtc(value);
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function addDaysIso(baseDate, days) {
  const date = new Date(baseDate.getTime() + days * DAY_MS);
  return date.toISOString();
}

export function payoutCycleDays(mode) {
  if (mode === "monthly") return 30;
  if (mode === "quarterly") return 90;
  if (mode === "yearly") return 365;
  if (mode === "reinvest") return 30;
  return 0;
}

export async function ensureBankingMetaTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS banking_meta_settings (
      id                    INTEGER PRIMARY KEY CHECK(id = 1),
      credit_annual_rate    REAL    NOT NULL CHECK(credit_annual_rate >= 0),
      default_credit_limit  INTEGER NOT NULL CHECK(default_credit_limit >= 0),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_by            INTEGER REFERENCES users(id)
    )
  `).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO banking_meta_settings
      (id, credit_annual_rate, default_credit_limit, updated_at)
    VALUES
      (1, ?, ?, datetime('now'))
  `).bind(DEFAULT_BANKING_META.credit_annual_rate, DEFAULT_BANKING_META.default_credit_limit).run();
}

export async function ensureBankCardsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS bank_cards (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_type                TEXT    NOT NULL DEFAULT 'credit' CHECK(card_type = 'credit'),
      status                   TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending', 'rejected')),
      card_last4               TEXT    NOT NULL,
      credit_limit             INTEGER NOT NULL DEFAULT 0,
      outstanding_balance      INTEGER NOT NULL DEFAULT 0,
      principal_outstanding    INTEGER NOT NULL DEFAULT 0,
      interest_outstanding     INTEGER NOT NULL DEFAULT 0,
      reward_claim_blocked     INTEGER NOT NULL DEFAULT 0,
      reward_claim_blocked_at  TEXT,
      annual_interest_rate     REAL    NOT NULL DEFAULT 0,
      interest_last_applied_at TEXT,
      last_borrowed_at         TEXT,
      last_payment_at          TEXT,
      created_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, card_type)
    )
  `).run();
}

export async function ensureBankCardsColumns(env) {
  const alterStatements = [
    "ALTER TABLE bank_cards ADD COLUMN principal_outstanding INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE bank_cards ADD COLUMN interest_outstanding INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE bank_cards ADD COLUMN reward_claim_blocked INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE bank_cards ADD COLUMN reward_claim_blocked_at TEXT",
    "ALTER TABLE bank_cards ADD COLUMN last_borrowed_at TEXT",
    "ALTER TABLE bank_cards ADD COLUMN last_payment_at TEXT",
  ];

  for (const sql of alterStatements) {
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      const msg = String(err?.message || "");
      if (!msg.includes("duplicate column name")) throw err;
    }
  }

  await env.DB.prepare(`
    UPDATE bank_cards
    SET interest_outstanding = COALESCE(interest_outstanding, 0),
        principal_outstanding = CASE
          WHEN COALESCE(principal_outstanding, 0) <= 0
               AND COALESCE(interest_outstanding, 0) <= 0
               AND COALESCE(outstanding_balance, 0) > 0
            THEN COALESCE(outstanding_balance, 0)
          ELSE COALESCE(principal_outstanding, 0)
        END
  `).run();

  await env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = COALESCE(principal_outstanding, 0) + COALESCE(interest_outstanding, 0)
    WHERE COALESCE(principal_outstanding, 0) + COALESCE(interest_outstanding, 0) > 0
  `).run();

  await env.DB.prepare(`
    UPDATE bank_cards
    SET reward_claim_blocked = 0,
        reward_claim_blocked_at = NULL
    WHERE COALESCE(outstanding_balance, 0) <= 0
  `).run();

  await env.DB.prepare(`
    UPDATE bank_cards
    SET reward_claim_blocked = 1,
        reward_claim_blocked_at = COALESCE(
          reward_claim_blocked_at,
          COALESCE(updated_at, created_at, datetime('now'))
        )
    WHERE COALESCE(credit_limit, 0) > 0
      AND COALESCE(outstanding_balance, 0) >= COALESCE(credit_limit, 0)
      AND COALESCE(outstanding_balance, 0) > 0
  `).run();
}

export async function removeLegacyNonCreditCards(env) {
  await env.DB.prepare(`
    DELETE FROM bank_cards
    WHERE card_type <> 'credit'
  `).run();
}

export async function ensureBankingInvestmentColumns(env) {
  const alterStatements = [
    "ALTER TABLE point_investments ADD COLUMN recurring_amount INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE point_investments ADD COLUMN recurring_frequency TEXT",
    "ALTER TABLE point_investments ADD COLUMN recurring_every_days INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE point_investments ADD COLUMN installments_total INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE point_investments ADD COLUMN installments_paid INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE point_investments ADD COLUMN next_installment_at TEXT",
    "ALTER TABLE point_investments ADD COLUMN payout_mode TEXT NOT NULL DEFAULT 'closure'",
    "ALTER TABLE point_investments ADD COLUMN payout_every_days INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE point_investments ADD COLUMN next_payout_at TEXT",
    "ALTER TABLE point_investments ADD COLUMN last_interest_calc_at TEXT",
    "ALTER TABLE point_investments ADD COLUMN accrued_interest_points INTEGER NOT NULL DEFAULT 0",
  ];

  for (const sql of alterStatements) {
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      const msg = String(err?.message || "");
      if (!msg.includes("duplicate column name")) throw err;
    }
  }

  await env.DB.prepare(`
    UPDATE point_investments
    SET payout_mode = COALESCE(NULLIF(payout_mode, ''), 'closure'),
        installments_total = CASE WHEN installments_total < 1 THEN 1 ELSE installments_total END,
        installments_paid = CASE WHEN installments_paid < 1 THEN 1 ELSE installments_paid END,
        last_interest_calc_at = COALESCE(last_interest_calc_at, opened_at),
        accrued_interest_points = COALESCE(accrued_interest_points, 0)
  `).run();
}

export async function ensureBankingTables(env) {
  await ensurePointsFinanceTables(env);
  await ensureBankingMetaTable(env);
  await ensureBankCardsTable(env);
  await ensureBankCardsColumns(env);
  await removeLegacyNonCreditCards(env);
  await ensureBankingInvestmentColumns(env);
}

export async function getBankingMetaSettings(env, { ensure = false } = {}) {
  if (ensure) await ensureBankingMetaTable(env);
  const row = await env.DB.prepare(`
    SELECT credit_annual_rate, default_credit_limit
    FROM banking_meta_settings
    WHERE id = 1
  `).first();

  return {
    credit_annual_rate: Number(row?.credit_annual_rate ?? DEFAULT_BANKING_META.credit_annual_rate),
    credit_monthly_rate: Number(row?.credit_annual_rate ?? DEFAULT_BANKING_META.credit_monthly_rate),
    default_credit_limit: Number(row?.default_credit_limit ?? DEFAULT_BANKING_META.default_credit_limit),
  };
}

export function generateCardLast4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function getUserCreditCard(env, userId) {
  return env.DB.prepare(`
    SELECT id, user_id, card_type, status, card_last4,
           credit_limit, outstanding_balance, principal_outstanding, interest_outstanding,
           reward_claim_blocked, reward_claim_blocked_at,
           annual_interest_rate, interest_last_applied_at, last_borrowed_at, last_payment_at,
           created_at, updated_at
    FROM bank_cards
    WHERE user_id = ? AND card_type = 'credit'
  `).bind(userId).first();
}

export async function applyCreditInterest(env, userId) {
  const card = await getUserCreditCard(env, userId);
  if (!card || String(card.status) !== "active") return card;

  let principalOutstanding = Number(card.principal_outstanding || 0);
  const interestOutstanding = Number(card.interest_outstanding || 0);
  const outstanding = Number(card.outstanding_balance || (principalOutstanding + interestOutstanding));
  const splitTotal = principalOutstanding + interestOutstanding;
  if (outstanding !== splitTotal) {
    principalOutstanding = Math.max(0, principalOutstanding + (outstanding - splitTotal));
  }
  const monthlyRatePercent = Number(card.annual_interest_rate || 0);
  const lastApplied = parseDbDate(card.interest_last_applied_at || card.updated_at || card.created_at, new Date());
  const now = new Date();
  const monthsElapsed = Math.floor((now.getTime() - lastApplied.getTime()) / (30 * DAY_MS));
  if (monthsElapsed <= 0 || outstanding <= 0 || monthlyRatePercent <= 0) return card;

  const monthlyRate = monthlyRatePercent / 100;
  const compoundedOutstanding = Math.floor(outstanding * ((1 + monthlyRate) ** monthsElapsed));
  const interest = Math.max(0, compoundedOutstanding - outstanding);
  if (interest <= 0) return card;

  const newOutstanding = outstanding + interest;
  const newInterestOutstanding = interestOutstanding + interest;
  const creditLimit = Number(card.credit_limit || 0);
  const shouldBlockRewardClaims = creditLimit > 0 && newOutstanding >= creditLimit;
  const newInterestDate = addDaysIso(lastApplied, monthsElapsed * 30);
  await env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = ?,
        interest_outstanding = ?,
        interest_last_applied_at = ?,
        reward_claim_blocked = CASE WHEN ? = 1 THEN 1 ELSE reward_claim_blocked END,
        reward_claim_blocked_at = CASE
          WHEN ? = 1 THEN COALESCE(reward_claim_blocked_at, datetime('now'))
          ELSE reward_claim_blocked_at
        END,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    newOutstanding,
    newInterestOutstanding,
    newInterestDate,
    shouldBlockRewardClaims ? 1 : 0,
    shouldBlockRewardClaims ? 1 : 0,
    card.id
  ).run();

  return getUserCreditCard(env, userId);
}

export async function processBankingInvestments(env, userId) {
  const now = new Date();
  let pointsBalance = await getUserNetPoints(env, userId);
  const result = await env.DB.prepare(`
    SELECT *
    FROM point_investments
    WHERE user_id = ? AND status = 'active'
    ORDER BY id ASC
  `).bind(userId).all();

  for (const inv of result.results || []) {
    let principal = Number(inv.principal_points || 0);
    let accrued = Number(inv.accrued_interest_points || 0);
    let interestPoints = Number(inv.interest_points || 0);
    let payoutPoints = Number(inv.payout_points || 0);
    let installmentsPaid = Number(inv.installments_paid || 0);
    const installmentsTotal = Number(inv.installments_total || 1);
    const recurringAmount = Number(inv.recurring_amount || 0);
    const recurringEveryDays = Number(inv.recurring_every_days || 0);
    const annualRate = Number(inv.annual_rate || 0);
    const payoutMode = String(inv.payout_mode || "closure");
    const payoutEveryDays = Number(inv.payout_every_days || 0);

    let nextInstallmentAt = parseDbDate(inv.next_installment_at, null);
    let nextPayoutAt = parseDbDate(inv.next_payout_at, null);
    let lastInterestCalcAt = parseDbDate(inv.last_interest_calc_at || inv.opened_at, parseDbDate(inv.opened_at, now));

    let changed = false;

    if (String(inv.plan_type) === "rd" && recurringAmount > 0 && recurringEveryDays > 0) {
      while (nextInstallmentAt && installmentsPaid < installmentsTotal && isOnOrAfterUtcDay(now, nextInstallmentAt)) {
        if (pointsBalance < recurringAmount) break;

        const reason = `RD installment (investment #${inv.id})`;
        await env.DB.prepare(`
          INSERT INTO bonus_points (user_id, points, reason, granted_by)
          VALUES (?, ?, ?, ?)
        `).bind(userId, -recurringAmount, reason, userId).run();

        pointsBalance -= recurringAmount;
        principal += recurringAmount;
        installmentsPaid += 1;
        nextInstallmentAt = new Date(nextInstallmentAt.getTime() + recurringEveryDays * DAY_MS);
        changed = true;
      }
    }

    if (principal > 0 && annualRate > 0 && lastInterestCalcAt) {
      const elapsedDays = elapsedUtcDays(lastInterestCalcAt, now);
      if (elapsedDays > 0) {
        const interestAdd = Math.max(0, Math.floor((principal * annualRate * elapsedDays) / 36500));
        if (interestAdd > 0) {
          accrued += interestAdd;
          interestPoints += interestAdd;
        }
        lastInterestCalcAt = addUtcDaysFromStart(lastInterestCalcAt, elapsedDays);
        changed = true;
      }
    }

    if (payoutEveryDays > 0 && nextPayoutAt) {
      while (isOnOrAfterUtcDay(now, nextPayoutAt)) {
        if (accrued > 0) {
          if (payoutMode === "reinvest") {
            principal += accrued;
          } else {
            const reason = `${String(inv.plan_type || "fd").toUpperCase()} interest payout (investment #${inv.id})`;
            await env.DB.prepare(`
              INSERT INTO bonus_points (user_id, points, reason, granted_by)
              VALUES (?, ?, ?, ?)
            `).bind(userId, accrued, reason, userId).run();
            pointsBalance += accrued;
            payoutPoints += accrued;
          }
          accrued = 0;
        }
        nextPayoutAt = new Date(nextPayoutAt.getTime() + payoutEveryDays * DAY_MS);
        changed = true;
      }
    }

    if (!changed) continue;

    await env.DB.prepare(`
      UPDATE point_investments
      SET principal_points = ?,
          installments_paid = ?,
          next_installment_at = ?,
          accrued_interest_points = ?,
          interest_points = ?,
          payout_points = ?,
          last_interest_calc_at = ?,
          next_payout_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      principal,
      installmentsPaid,
      nextInstallmentAt ? nextInstallmentAt.toISOString() : null,
      accrued,
      interestPoints,
      payoutPoints,
      lastInterestCalcAt ? lastInterestCalcAt.toISOString() : null,
      nextPayoutAt ? nextPayoutAt.toISOString() : null,
      inv.id,
      userId
    ).run();
  }
}

export function serializeInvestment(row) {
  const now = Date.now();
  const maturityMs = Date.parse(toIsoUtc(row.maturity_at));
  const isMatured = Number.isFinite(maturityMs) ? now >= maturityMs : false;
  return {
    id: Number(row.id),
    plan_type: String(row.plan_type || "fd"),
    principal_points: Number(row.principal_points || 0),
    annual_rate: Number(row.annual_rate || 0),
    tenure_days: Number(row.tenure_days || 0),
    payout_mode: String(row.payout_mode || "closure"),
    recurring_amount: Number(row.recurring_amount || 0),
    recurring_frequency: row.recurring_frequency || null,
    installments_total: Number(row.installments_total || 1),
    installments_paid: Number(row.installments_paid || 0),
    next_installment_at: row.next_installment_at || null,
    opened_at: row.opened_at,
    maturity_at: row.maturity_at,
    status: String(row.status || "active"),
    next_payout_at: row.next_payout_at || null,
    accrued_interest_points: Number(row.accrued_interest_points || 0),
    interest_points: Number(row.interest_points || 0),
    payout_points: Number(row.payout_points || 0),
    can_close: String(row.status) === "active" && isMatured,
  };
}

export async function getUserBankingSnapshot(env, userId) {
  await ensureBankingTables(env);
  await processBankingInvestments(env, userId);
  const creditCard = await applyCreditInterest(env, userId);

  const [pointsBalance, cardsRes, invRes, rates, meta] = await Promise.all([
    getUserNetPoints(env, userId),
    env.DB.prepare(`
      SELECT id, card_type, status, card_last4,
             credit_limit, outstanding_balance, principal_outstanding, interest_outstanding,
             reward_claim_blocked, reward_claim_blocked_at,
             annual_interest_rate, interest_last_applied_at, last_borrowed_at, last_payment_at,
             created_at, updated_at
      FROM bank_cards
      WHERE user_id = ? AND card_type = 'credit'
      ORDER BY id ASC
    `).bind(userId).all(),
    env.DB.prepare(`
      SELECT *
      FROM point_investments
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 40
    `).bind(userId).all(),
    getFinanceRates(env, { ensure: true }),
    getBankingMetaSettings(env, { ensure: true }),
  ]);

  const creditBalance = Number(creditCard?.outstanding_balance || 0);
  const creditPrincipalDue = Number(creditCard?.principal_outstanding || 0);
  const creditInterestDue = Number(creditCard?.interest_outstanding || 0);
  const creditLimit = Number(creditCard?.credit_limit || 0);

  return {
    points_balance: pointsBalance,
    credit_balance: creditBalance,
    credit_bill: {
      principal_due: creditPrincipalDue,
      interest_due: creditInterestDue,
      total_due: creditPrincipalDue + creditInterestDue,
      last_borrowed_at: creditCard?.last_borrowed_at || null,
      last_payment_at: creditCard?.last_payment_at || null,
    },
    credit_available: Math.max(0, creditLimit - creditBalance),
    finance_rates: rates,
    banking_meta: meta,
    cards: (cardsRes.results || []).map((card) => ({
      id: Number(card.id),
      card_type: String(card.card_type),
      status: String(card.status),
      card_last4: String(card.card_last4),
      credit_limit: Number(card.credit_limit || 0),
      outstanding_balance: Number(card.outstanding_balance || 0),
      principal_outstanding: Number(card.principal_outstanding || 0),
      interest_outstanding: Number(card.interest_outstanding || 0),
      reward_claim_blocked: Number(card.reward_claim_blocked || 0) === 1,
      reward_claim_blocked_at: card.reward_claim_blocked_at || null,
      annual_interest_rate: Number(card.annual_interest_rate || 0),
      monthly_interest_rate: Number(card.annual_interest_rate || 0),
      interest_last_applied_at: card.interest_last_applied_at || null,
      last_borrowed_at: card.last_borrowed_at || null,
      last_payment_at: card.last_payment_at || null,
      created_at: card.created_at,
    })),
    investments: (invRes.results || []).map(serializeInvestment),
  };
}
