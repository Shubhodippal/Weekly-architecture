import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  calculateInvestmentInterest,
  ensurePointsFinanceTables,
  getUserNetPoints,
  toIsoUtc,
} from "../../utils/pointsFinance.js";

/**
 * POST /api/points/finance/:id/close
 * User: close a matured FD/RD and receive principal + interest.
 */
export async function handleCloseInvestment(request, env, investmentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = Number.parseInt(investmentId, 10);
  if (!id || Number.isNaN(id)) {
    return json({ success: false, message: "Invalid investment id" }, 400);
  }

  const userId = session.userId;
  await ensurePointsFinanceTables(env);

  const investment = await env.DB.prepare(`
    SELECT id, user_id, plan_type, principal_points, annual_rate, tenure_days,
           opened_at, maturity_at, status, closed_at, interest_points, payout_points
    FROM point_investments
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first();

  if (!investment) {
    return json({ success: false, message: "Investment not found" }, 404);
  }

  if (String(investment.status) !== "active") {
    return json({ success: false, message: "Investment is already closed" }, 400);
  }

  const maturityMs = Date.parse(toIsoUtc(investment.maturity_at));
  if (Number.isNaN(maturityMs)) {
    return json({ success: false, message: "Invalid maturity date for investment" }, 500);
  }
  if (Date.now() < maturityMs) {
    return json({
      success: false,
      message: `This investment matures on ${investment.maturity_at}.`,
    }, 400);
  }

  const principalPoints = Number(investment.principal_points || 0);
  const annualRate = Number(investment.annual_rate || 0);
  const tenureDays = Number(investment.tenure_days || 0);

  const interestPoints = calculateInvestmentInterest({
    principalPoints,
    annualRate,
    tenureDays,
  });
  const payoutPoints = principalPoints + interestPoints;

  const closedAt = new Date().toISOString();
  const updateStmt = env.DB.prepare(`
    UPDATE point_investments
    SET status = 'closed',
        closed_at = ?,
        interest_points = ?,
        payout_points = ?
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).bind(closedAt, interestPoints, payoutPoints, id, userId);

  const reason = `${String(investment.plan_type || "fd").toUpperCase()} closed: +${payoutPoints} pts (principal ${principalPoints} + interest ${interestPoints})`;
  const creditStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    SELECT ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1
      FROM point_investments
      WHERE id = ?
        AND user_id = ?
        AND status = 'closed'
        AND closed_at = ?
    )
  `).bind(userId, payoutPoints, reason, userId, id, userId, closedAt);

  await env.DB.batch([updateStmt, creditStmt]);

  const [balanceAfter, updated] = await Promise.all([
    getUserNetPoints(env, userId),
    env.DB.prepare(`
      SELECT id, plan_type, principal_points, annual_rate, tenure_days,
             opened_at, maturity_at, status, closed_at, interest_points, payout_points
      FROM point_investments
      WHERE id = ? AND user_id = ?
    `).bind(id, userId).first(),
  ]);

  if (!updated || String(updated.status) !== "closed") {
    return json({ success: false, message: "Could not close investment. Please try again." }, 400);
  }

  return json({
    success: true,
    message: "Investment closed and payout credited.",
    balance: balanceAfter,
    investment: updated
      ? {
          id: Number(updated.id),
          plan_type: String(updated.plan_type),
          principal_points: Number(updated.principal_points),
          annual_rate: Number(updated.annual_rate),
          tenure_days: Number(updated.tenure_days),
          opened_at: updated.opened_at,
          maturity_at: updated.maturity_at,
          status: String(updated.status),
          closed_at: updated.closed_at,
          interest_points: Number(updated.interest_points || 0),
          payout_points: Number(updated.payout_points || 0),
        }
      : null,
  });
}
