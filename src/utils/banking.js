import { ensurePointsFinanceTables, getFinanceRates, getUserNetPoints, toIsoUtc } from "./pointsFinance.js";

export const PAYOUT_MODES = ["monthly", "quarterly", "yearly", "closure", "reinvest"];
export const RD_FREQUENCIES = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export const DEFAULT_BANKING_META = {
  credit_annual_rate: 24,
  default_credit_limit: 500,
};

const DAY_MS = 86400000;

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
    )
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
    default_credit_limit: Number(row?.default_credit_limit ?? DEFAULT_BANKING_META.default_credit_limit),
  };
}

export function generateCardLast4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function ensureUserDebitCard(env, userId) {
  const existing = await env.DB.prepare(`
    SELECT id, card_type, status, card_last4
    FROM bank_cards
    WHERE user_id = ? AND card_type = 'debit'
  `).bind(userId).first();
  if (existing) return existing;

  const last4 = generateCardLast4();
  await env.DB.prepare(`
    INSERT INTO bank_cards
      (user_id, card_type, status, card_last4, created_at, updated_at)
    VALUES
      (?, 'debit', 'active', ?, datetime('now'), datetime('now'))
  `).bind(userId, last4).run();

  return env.DB.prepare(`
    SELECT id, card_type, status, card_last4
    FROM bank_cards
    WHERE user_id = ? AND card_type = 'debit'
  `).bind(userId).first();
}

export async function getUserCreditCard(env, userId) {
  return env.DB.prepare(`
    SELECT id, user_id, card_type, status, card_last4,
           credit_limit, outstanding_balance, annual_interest_rate,
           interest_last_applied_at, created_at, updated_at
    FROM bank_cards
    WHERE user_id = ? AND card_type = 'credit'
  `).bind(userId).first();
}

export async function applyCreditInterest(env, userId) {
  const card = await getUserCreditCard(env, userId);
  if (!card || String(card.status) !== "active") return card;

  const outstanding = Number(card.outstanding_balance || 0);
  const annualRate = Number(card.annual_interest_rate || 0);
  const lastApplied = parseDbDate(card.interest_last_applied_at || card.updated_at || card.created_at, new Date());
  const now = new Date();
  const monthsElapsed = Math.floor((now.getTime() - lastApplied.getTime()) / (30 * DAY_MS));
  if (monthsElapsed <= 0 || outstanding <= 0 || annualRate <= 0) return card;

  const monthlyRate = annualRate / 12 / 100;
  const interest = Math.max(0, Math.floor(outstanding * monthlyRate * monthsElapsed));
  if (interest <= 0) return card;

  const newOutstanding = outstanding + interest;
  const newInterestDate = addDaysIso(lastApplied, monthsElapsed * 30);
  await env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = ?,
        interest_last_applied_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(newOutstanding, newInterestDate, card.id).run();

  return getUserCreditCard(env, userId);
}

export async function processBankingInvestments(env, userId) {
  const now = new Date();
  let debitBalance = await getUserNetPoints(env, userId);
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
      while (nextInstallmentAt && installmentsPaid < installmentsTotal && now >= nextInstallmentAt) {
        if (debitBalance < recurringAmount) break;

        const reason = `RD installment (investment #${inv.id})`;
        await env.DB.prepare(`
          INSERT INTO bonus_points (user_id, points, reason, granted_by)
          VALUES (?, ?, ?, ?)
        `).bind(userId, -recurringAmount, reason, userId).run();

        debitBalance -= recurringAmount;
        principal += recurringAmount;
        installmentsPaid += 1;
        nextInstallmentAt = new Date(nextInstallmentAt.getTime() + recurringEveryDays * DAY_MS);
        changed = true;
      }
    }

    if (principal > 0 && annualRate > 0 && lastInterestCalcAt) {
      const elapsedDays = Math.floor((now.getTime() - lastInterestCalcAt.getTime()) / DAY_MS);
      if (elapsedDays > 0) {
        const interestAdd = Math.max(0, Math.floor((principal * annualRate * elapsedDays) / 36500));
        if (interestAdd > 0) {
          accrued += interestAdd;
          interestPoints += interestAdd;
        }
        lastInterestCalcAt = new Date(lastInterestCalcAt.getTime() + elapsedDays * DAY_MS);
        changed = true;
      }
    }

    if (payoutEveryDays > 0 && nextPayoutAt) {
      while (now >= nextPayoutAt) {
        if (accrued > 0) {
          if (payoutMode === "reinvest") {
            principal += accrued;
          } else {
            const reason = `${String(inv.plan_type || "fd").toUpperCase()} interest payout (investment #${inv.id})`;
            await env.DB.prepare(`
              INSERT INTO bonus_points (user_id, points, reason, granted_by)
              VALUES (?, ?, ?, ?)
            `).bind(userId, accrued, reason, userId).run();
            debitBalance += accrued;
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
    opened_at: row.opened_at,
    maturity_at: row.maturity_at,
    status: String(row.status || "active"),
    accrued_interest_points: Number(row.accrued_interest_points || 0),
    interest_points: Number(row.interest_points || 0),
    payout_points: Number(row.payout_points || 0),
    can_close: String(row.status) === "active" && isMatured,
  };
}

export async function getUserBankingSnapshot(env, userId) {
  await ensureBankingTables(env);
  await ensureUserDebitCard(env, userId);
  await processBankingInvestments(env, userId);
  const creditCard = await applyCreditInterest(env, userId);

  const [debitBalance, cardsRes, invRes, rates, meta] = await Promise.all([
    getUserNetPoints(env, userId),
    env.DB.prepare(`
      SELECT id, card_type, status, card_last4,
             credit_limit, outstanding_balance, annual_interest_rate,
             interest_last_applied_at, created_at, updated_at
      FROM bank_cards
      WHERE user_id = ?
      ORDER BY CASE WHEN card_type = 'debit' THEN 0 ELSE 1 END, id ASC
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
  const creditLimit = Number(creditCard?.credit_limit || 0);

  return {
    debit_balance: debitBalance,
    credit_balance: creditBalance,
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
      annual_interest_rate: Number(card.annual_interest_rate || 0),
      interest_last_applied_at: card.interest_last_applied_at || null,
      created_at: card.created_at,
    })),
    investments: (invRes.results || []).map(serializeInvestment),
  };
}
