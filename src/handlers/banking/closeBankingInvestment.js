import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  ensureBankingTables,
  processBankingInvestments,
  getUserBankingSnapshot,
} from "../../utils/banking.js";
import { toIsoUtc } from "../../utils/pointsFinance.js";

/**
 * POST /api/banking/investments/:id/close
 * Close a matured FD/RD and credit closure payout.
 */
export async function handleCloseBankingInvestment(request, env, investmentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = Number.parseInt(investmentId, 10);
  if (!id || Number.isNaN(id)) {
    return json({ success: false, message: "Invalid investment id" }, 400);
  }

  const userId = session.userId;
  await ensureBankingTables(env);
  await processBankingInvestments(env, userId);

  const inv = await env.DB.prepare(`
    SELECT id, user_id, plan_type, principal_points, annual_rate, tenure_days,
           opened_at, maturity_at, status, closed_at,
           payout_mode, accrued_interest_points, interest_points, payout_points
    FROM point_investments
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first();

  if (!inv) {
    return json({ success: false, message: "Investment not found" }, 404);
  }
  if (String(inv.status) !== "active") {
    return json({ success: false, message: "Investment is already closed" }, 400);
  }

  const maturityMs = Date.parse(toIsoUtc(inv.maturity_at));
  if (!Number.isFinite(maturityMs)) {
    return json({ success: false, message: "Invalid maturity date for investment" }, 500);
  }
  if (Date.now() < maturityMs) {
    return json({
      success: false,
      message: `This investment matures on ${inv.maturity_at}.`,
    }, 400);
  }

  const principal = Number(inv.principal_points || 0);
  const pendingInterest = Number(inv.accrued_interest_points || 0);
  const totalInterest = Number(inv.interest_points || 0);
  const payoutBeforeClose = Number(inv.payout_points || 0);
  const closurePayout = principal + pendingInterest;
  const closedAt = new Date().toISOString();
  const planLabel = String(inv.plan_type || "fd").toUpperCase();

  const updateStmt = env.DB.prepare(`
    UPDATE point_investments
    SET status = 'closed',
        closed_at = ?,
        interest_points = ?,
        payout_points = ?,
        accrued_interest_points = 0,
        next_installment_at = NULL,
        next_payout_at = NULL
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).bind(closedAt, totalInterest, payoutBeforeClose + closurePayout, id, userId);

  const payoutStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    SELECT ?, ?, ?, ?
    WHERE ? > 0
      AND EXISTS (
        SELECT 1
        FROM point_investments
        WHERE id = ?
          AND user_id = ?
          AND status = 'closed'
          AND closed_at = ?
      )
  `).bind(
    userId,
    closurePayout,
    `${planLabel} closed: +${closurePayout} pts (principal ${principal} + interest ${pendingInterest})`,
    userId,
    closurePayout,
    id,
    userId,
    closedAt
  );

  await env.DB.batch([updateStmt, payoutStmt]);

  const updated = await env.DB.prepare(`
    SELECT id, status, closed_at, payout_points
    FROM point_investments
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first();

  if (!updated || String(updated.status) !== "closed") {
    return json({ success: false, message: "Could not close investment. Please try again." }, 400);
  }

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({
    success: true,
    message: "Investment closed and payout credited.",
    ...snapshot,
  });
}
