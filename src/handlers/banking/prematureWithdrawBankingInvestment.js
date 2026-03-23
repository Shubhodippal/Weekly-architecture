import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  ensureBankingTables,
  getUserBankingSnapshot,
  processBankingInvestments,
} from "../../utils/banking.js";
import { toIsoUtc } from "../../utils/pointsFinance.js";

/**
 * POST /api/banking/investments/:id/premature-withdraw
 * Body: { amount?: number }
 * - If amount is omitted, full principal is withdrawn and investment is closed.
 * - Premature withdrawal penalty: 2% of withdrawn amount (rounded up).
 */
export async function handlePrematureWithdrawBankingInvestment(request, env, investmentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = Number.parseInt(investmentId, 10);
  if (!id || Number.isNaN(id)) {
    return json({ success: false, message: "Invalid investment id" }, 400);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const userId = session.userId;
  await ensureBankingTables(env);
  await processBankingInvestments(env, userId);

  const inv = await env.DB.prepare(`
    SELECT id, user_id, plan_type, principal_points, annual_rate, tenure_days,
           opened_at, maturity_at, status, closed_at,
           next_installment_at, next_payout_at,
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
  if (Date.now() >= maturityMs) {
    return json({
      success: false,
      message: "Investment already matured. Use regular close to get full payout without premature penalty.",
    }, 400);
  }

  const principal = Number(inv.principal_points || 0);
  if (principal <= 0) {
    return json({ success: false, message: "No withdrawable principal available." }, 400);
  }

  const hasAmount = body && Object.prototype.hasOwnProperty.call(body, "amount");
  const requestedAmount = hasAmount ? Number.parseInt(body?.amount, 10) : principal;
  if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) {
    return json({ success: false, message: "amount must be a positive integer" }, 400);
  }
  if (requestedAmount > principal) {
    return json({ success: false, message: `You can withdraw at most ${principal} pts.` }, 400);
  }

  const penalty = Math.ceil(requestedAmount * 0.02);
  const credited = requestedAmount - penalty;
  if (credited <= 0) {
    return json({
      success: false,
      message: `Withdrawal amount is too small after 2% penalty. Minimum safe amount is 2 pts.`,
    }, 400);
  }

  const isFullClose = requestedAmount === principal;
  const nowIso = new Date().toISOString();

  const accruedBefore = Number(inv.accrued_interest_points || 0);
  const interestBefore = Number(inv.interest_points || 0);
  const payoutBefore = Number(inv.payout_points || 0);

  // Premature withdrawal forfeits proportional pending accrued interest.
  const forfeitedAccrued = Math.floor((accruedBefore * requestedAmount) / principal);
  const accruedAfter = Math.max(0, accruedBefore - forfeitedAccrued);
  const interestAfter = Math.max(0, interestBefore - forfeitedAccrued);
  const principalAfter = principal - requestedAmount;

  const updateStmt = env.DB.prepare(`
    UPDATE point_investments
    SET principal_points = ?,
        status = ?,
        closed_at = ?,
        accrued_interest_points = ?,
        interest_points = ?,
        payout_points = ?,
        next_installment_at = ?,
        next_payout_at = ?
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).bind(
    isFullClose ? principal : principalAfter,
    isFullClose ? "closed" : "active",
    isFullClose ? nowIso : null,
    isFullClose ? 0 : accruedAfter,
    isFullClose ? interestAfter : interestAfter,
    payoutBefore + credited,
    isFullClose ? null : inv.next_installment_at,
    isFullClose ? null : inv.next_payout_at,
    id,
    userId
  );

  const planLabel = String(inv.plan_type || "fd").toUpperCase();
  const payoutStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(
    userId,
    credited,
    `${planLabel} premature ${isFullClose ? "closure" : "withdrawal"}: +${credited} pts (withdrawn ${requestedAmount}, penalty ${penalty})`,
    userId
  );

  await env.DB.batch([updateStmt, payoutStmt]);

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({
    success: true,
    message: isFullClose
      ? `Premature full closure successful. Withdrawn ${requestedAmount} pts, penalty ${penalty} pts (2%), credited ${credited} pts.`
      : `Premature partial withdrawal successful. Withdrawn ${requestedAmount} pts, penalty ${penalty} pts (2%), credited ${credited} pts.`,
    premature_withdrawal: {
      investment_id: id,
      full_close: isFullClose,
      withdrawn_amount: requestedAmount,
      penalty_rate_percent: 2,
      penalty_points: penalty,
      credited_points: credited,
      forfeited_accrued_interest_points: forfeitedAccrued,
      principal_before: principal,
      principal_after: isFullClose ? 0 : principalAfter,
      accrued_interest_before: accruedBefore,
      accrued_interest_after: isFullClose ? 0 : accruedAfter,
    },
    ...snapshot,
  });
}
