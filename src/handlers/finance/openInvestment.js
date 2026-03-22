import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  FINANCE_PLAN_TYPES,
  ensurePointsFinanceTables,
  getFinanceRates,
  getUserNetPoints,
} from "../../utils/pointsFinance.js";

/**
 * POST /api/points/finance/open
 * Body: { plan_type: 'fd' | 'rd', principal_points: number, tenure_days: number }
 */
export async function handleOpenInvestment(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const planType = String(body?.plan_type || "").trim().toLowerCase();
  if (!FINANCE_PLAN_TYPES.includes(planType)) {
    return json({ success: false, message: "plan_type must be 'fd' or 'rd'" }, 400);
  }

  const principalPoints = Number.parseInt(body?.principal_points, 10);
  if (!Number.isInteger(principalPoints) || principalPoints <= 0) {
    return json({ success: false, message: "principal_points must be a positive integer" }, 400);
  }

  const tenureDays = Number.parseInt(body?.tenure_days, 10);
  if (!Number.isInteger(tenureDays) || tenureDays < 1 || tenureDays > 3650) {
    return json({ success: false, message: "tenure_days must be an integer between 1 and 3650" }, 400);
  }

  const userId = session.userId;
  await ensurePointsFinanceTables(env);

  const [rates, balanceBefore] = await Promise.all([
    getFinanceRates(env, { ensure: true }),
    getUserNetPoints(env, userId),
  ]);

  if (balanceBefore < principalPoints) {
    return json({
      success: false,
      message: `Not enough points. You have ${balanceBefore} pts but need ${principalPoints} pts.`,
    }, 400);
  }

  const annualRate = Number(rates[planType] || 0);
  const planLabel = planType.toUpperCase();
  const reason = `${planLabel} opened: -${principalPoints} pts (${tenureDays} days @ ${annualRate}% p.a.)`;

  const insertInvestmentStmt = env.DB.prepare(`
    INSERT INTO point_investments
      (user_id, plan_type, principal_points, annual_rate, tenure_days, opened_at, maturity_at, status)
    VALUES
      (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+' || ? || ' days'), 'active')
  `).bind(userId, planType, principalPoints, annualRate, tenureDays, tenureDays);

  const deductStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, -principalPoints, reason, userId);

  await env.DB.batch([insertInvestmentStmt, deductStmt]);

  const [balanceAfter, latest] = await Promise.all([
    getUserNetPoints(env, userId),
    env.DB.prepare(`
      SELECT id, plan_type, principal_points, annual_rate, tenure_days, opened_at, maturity_at, status
      FROM point_investments
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(userId).first(),
  ]);

  return json({
    success: true,
    message: `${planLabel} created successfully.`,
    balance: balanceAfter,
    finance_rates: rates,
    investment: latest
      ? {
          id: Number(latest.id),
          plan_type: String(latest.plan_type),
          principal_points: Number(latest.principal_points),
          annual_rate: Number(latest.annual_rate),
          tenure_days: Number(latest.tenure_days),
          opened_at: latest.opened_at,
          maturity_at: latest.maturity_at,
          status: String(latest.status || "active"),
        }
      : null,
  });
}
