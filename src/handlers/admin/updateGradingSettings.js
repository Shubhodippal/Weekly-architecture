import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { GRADE_KEYS, getGradingPoints, ensureGradingSettingsTable } from "../../utils/gradingSettings.js";
import { HINT_LEVELS, getHintCosts, ensureHintCostTable } from "../../utils/hintCosts.js";
import {
  FINANCE_PLAN_TYPES,
  getFinanceRates,
  ensureFinanceSettingsTable,
} from "../../utils/pointsFinance.js";
import {
  getBankingMetaSettings,
  ensureBankingMetaTable,
} from "../../utils/banking.js";

/**
 * PATCH /api/admin/grading/settings
 * Admin: update grade points, hint costs, finance rates, and banking controls.
 */
export async function handleAdminUpdateGradingSettings(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const pointsSource = body?.points && typeof body.points === "object" ? body.points : body;
  const hintCostSource = body?.hint_costs && typeof body.hint_costs === "object" ? body.hint_costs : {};
  const financeRateSource = body?.finance_rates && typeof body.finance_rates === "object" ? body.finance_rates : {};
  const bankingMetaSource = body?.banking_meta && typeof body.banking_meta === "object" ? body.banking_meta : {};

  if (
    (!pointsSource || typeof pointsSource !== "object")
    && (!hintCostSource || typeof hintCostSource !== "object")
    && (!financeRateSource || typeof financeRateSource !== "object")
    && (!bankingMetaSource || typeof bankingMetaSource !== "object")
  ) {
    return json({ success: false, message: "Expected an object with points, hint_costs, finance_rates, and/or banking_meta values" }, 400);
  }

  const pointUpdates = [];
  for (const grade of GRADE_KEYS) {
    if (pointsSource[grade] === undefined) continue;
    const points = parseInt(pointsSource[grade], 10);
    if (Number.isNaN(points)) {
      return json({ success: false, message: `${grade} must be an integer` }, 400);
    }
    pointUpdates.push([grade, points]);
  }

  const hintUpdates = [];
  for (const level of HINT_LEVELS) {
    const raw = hintCostSource[level] ?? hintCostSource[String(level)];
    if (raw === undefined) continue;
    const cost = parseInt(raw, 10);
    if (Number.isNaN(cost) || cost < 0) {
      return json({ success: false, message: `hint_cost for level ${level} must be a non-negative integer` }, 400);
    }
    hintUpdates.push([level, level === 1 ? 0 : cost]);
  }

  const financeUpdates = [];
  for (const planType of FINANCE_PLAN_TYPES) {
    const raw = financeRateSource[planType];
    if (raw === undefined) continue;
    const rate = Number.parseFloat(raw);
    if (Number.isNaN(rate) || rate < 0 || rate > 1000) {
      return json({ success: false, message: `${planType}_rate must be a non-negative number (max 1000)` }, 400);
    }
    financeUpdates.push([planType, rate]);
  }

  const bankingUpdates = {};
  if (bankingMetaSource.credit_annual_rate !== undefined) {
    const rate = Number.parseFloat(bankingMetaSource.credit_annual_rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 1000) {
      return json({ success: false, message: "credit_annual_rate must be a non-negative number (max 1000)" }, 400);
    }
    bankingUpdates.credit_annual_rate = Number(rate.toFixed(2));
  }
  if (bankingMetaSource.default_credit_limit !== undefined) {
    const limit = Number.parseInt(bankingMetaSource.default_credit_limit, 10);
    if (!Number.isInteger(limit) || limit < 0 || limit > 100000000) {
      return json({ success: false, message: "default_credit_limit must be a non-negative integer" }, 400);
    }
    bankingUpdates.default_credit_limit = limit;
  }

  if (
    pointUpdates.length === 0
    && hintUpdates.length === 0
    && financeUpdates.length === 0
    && Object.keys(bankingUpdates).length === 0
  ) {
    return json({ success: false, message: "Nothing to update" }, 400);
  }

  await ensureGradingSettingsTable(env);
  await ensureHintCostTable(env);
  await ensureFinanceSettingsTable(env);
  await ensureBankingMetaTable(env);

  const now = new Date().toISOString();
  const pointOps = pointUpdates.map(([grade, points]) =>
    env.DB.prepare(`
      INSERT INTO grading_settings (grade, points, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(grade) DO UPDATE SET
        points = excluded.points,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(grade, points, now, session.userId)
  );
  const hintOps = hintUpdates.map(([level, cost]) =>
    env.DB.prepare(`
      INSERT INTO hint_cost_settings (level, cost, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(level) DO UPDATE SET
        cost = excluded.cost,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(level, cost, now, session.userId)
  );
  const financeOps = financeUpdates.map(([planType, rate]) =>
    env.DB.prepare(`
      INSERT INTO finance_settings (plan_type, annual_rate, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(plan_type) DO UPDATE SET
        annual_rate = excluded.annual_rate,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(planType, rate, now, session.userId)
  );
  const bankingOps = [];
  if (Object.keys(bankingUpdates).length > 0) {
    bankingOps.push(
      env.DB.prepare(`
        INSERT INTO banking_meta_settings
          (id, credit_annual_rate, default_credit_limit, updated_at, updated_by)
        VALUES
          (
            1,
            COALESCE(?, (SELECT credit_annual_rate FROM banking_meta_settings WHERE id = 1)),
            COALESCE(?, (SELECT default_credit_limit FROM banking_meta_settings WHERE id = 1)),
            ?,
            ?
          )
        ON CONFLICT(id) DO UPDATE SET
          credit_annual_rate = COALESCE(excluded.credit_annual_rate, banking_meta_settings.credit_annual_rate),
          default_credit_limit = COALESCE(excluded.default_credit_limit, banking_meta_settings.default_credit_limit),
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).bind(
        bankingUpdates.credit_annual_rate ?? null,
        bankingUpdates.default_credit_limit ?? null,
        now,
        session.userId
      )
    );
  }
  await env.DB.batch([...pointOps, ...hintOps, ...financeOps, ...bankingOps]);

  const [settings, hintCosts, financeRates, bankingMeta] = await Promise.all([
    getGradingPoints(env, { ensure: true }),
    getHintCosts(env, { ensure: true }),
    getFinanceRates(env, { ensure: true }),
    getBankingMetaSettings(env, { ensure: true }),
  ]);

  return json({
    success: true,
    settings,
    hint_costs: hintCosts,
    finance_rates: financeRates,
    banking_meta: bankingMeta,
    updated_at: now,
  });
}
