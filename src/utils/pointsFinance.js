export const FINANCE_PLAN_TYPES = ["fd", "rd"];

export const DEFAULT_FINANCE_RATES = {
  fd: 8,
  rd: 10,
};

export async function ensureFinanceSettingsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS finance_settings (
      plan_type   TEXT PRIMARY KEY CHECK(plan_type IN ('fd', 'rd')),
      annual_rate REAL NOT NULL CHECK(annual_rate >= 0),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by  INTEGER REFERENCES users(id)
    )
  `).run();

  const ops = FINANCE_PLAN_TYPES.map((planType) =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO finance_settings (plan_type, annual_rate, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(planType, DEFAULT_FINANCE_RATES[planType])
  );
  await env.DB.batch(ops);
}

export async function ensurePointInvestmentsTable(env) {
  await env.DB.prepare(`
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
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_point_investments_user_status
    ON point_investments (user_id, status, maturity_at)
  `).run();
}

export async function ensurePointsFinanceTables(env) {
  await ensureFinanceSettingsTable(env);
  await ensurePointInvestmentsTable(env);
}

export async function getFinanceRates(env, { ensure = false } = {}) {
  const rates = { ...DEFAULT_FINANCE_RATES };
  try {
    if (ensure) await ensureFinanceSettingsTable(env);
    const rows = await env.DB.prepare(
      "SELECT plan_type, annual_rate FROM finance_settings WHERE plan_type IN ('fd', 'rd')"
    ).all();

    for (const row of rows.results || []) {
      const planType = String(row.plan_type || "").trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(rates, planType)) continue;
      const rate = Number.parseFloat(row.annual_rate);
      if (!Number.isNaN(rate) && rate >= 0) rates[planType] = rate;
    }
  } catch (err) {
    const msg = String(err?.message || "");
    if (!msg.includes("no such table")) {
      console.error("[pointsFinance] failed to load finance rates:", err);
    }
  }
  return rates;
}

export async function getUserNetPoints(env, userId) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = ?), 0)
      + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = ?), 0)
      - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = ?), 0)
      AS balance
  `).bind(userId, userId, userId).first();
  return Number(row?.balance || 0);
}

export function calculateInvestmentInterest({ principalPoints, annualRate, tenureDays }) {
  const principal = Number(principalPoints);
  const rate = Number(annualRate);
  const days = Number(tenureDays);
  if (Number.isNaN(principal) || Number.isNaN(rate) || Number.isNaN(days)) return 0;
  if (principal <= 0 || rate <= 0 || days <= 0) return 0;
  return Math.max(0, Math.floor((principal * rate * days) / 36500));
}

export function toIsoUtc(sqlDateTime) {
  if (!sqlDateTime) return null;
  const normalized = String(sqlDateTime).replace(" ", "T");
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`;
}
