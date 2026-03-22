import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  calculateInvestmentInterest,
  ensurePointsFinanceTables,
  getFinanceRates,
  getUserNetPoints,
} from "../../utils/pointsFinance.js";

/**
 * GET /api/points/finance
 * User: get FD/RD rates, current points balance, and investment history.
 */
export async function handleGetFinanceOverview(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const userId = session.userId;
  await ensurePointsFinanceTables(env);

  const [balance, rates, result] = await Promise.all([
    getUserNetPoints(env, userId),
    getFinanceRates(env, { ensure: true }),
    env.DB.prepare(`
      SELECT id, plan_type, principal_points, annual_rate, tenure_days,
             opened_at, maturity_at, status, closed_at, interest_points, payout_points
      FROM point_investments
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 30
    `).bind(userId).all(),
  ]);

  const nowMs = Date.now();
  const investments = (result.results || []).map((row) => {
    const principal = Number(row.principal_points || 0);
    const annualRate = Number(row.annual_rate || 0);
    const tenureDays = Number(row.tenure_days || 0);
    const maturityMs = Date.parse(String(row.maturity_at || "").replace(" ", "T") + "Z");
    const isMatured = Number.isFinite(maturityMs) ? nowMs >= maturityMs : false;
    const expectedInterest = calculateInvestmentInterest({
      principalPoints: principal,
      annualRate,
      tenureDays,
    });

    const isClosed = String(row.status) === "closed";

    return {
      id: Number(row.id),
      plan_type: String(row.plan_type || "fd"),
      principal_points: principal,
      annual_rate: annualRate,
      tenure_days: tenureDays,
      opened_at: row.opened_at,
      maturity_at: row.maturity_at,
      status: isClosed ? "closed" : "active",
      is_matured: !isClosed && isMatured,
      can_close: !isClosed && isMatured,
      closed_at: row.closed_at || null,
      interest_points: isClosed ? Number(row.interest_points || 0) : expectedInterest,
      payout_points: isClosed
        ? Number(row.payout_points || 0)
        : principal + expectedInterest,
    };
  });

  return json({
    success: true,
    balance,
    finance_rates: rates,
    investments,
  });
}
