import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  applyCreditInterest,
  ensureBankingTables,
  getUserBankingSnapshot,
  getUserCreditCard,
} from "../../utils/banking.js";
import { getUserNetPoints } from "../../utils/pointsFinance.js";

/**
 * POST /api/banking/credit/pay
 * Body: { amount: number }
 * Returns `payment_breakdown` with principal/interest split.
 */
export async function handleCreditPay(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const amount = Number.parseInt(body?.amount, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    return json({ success: false, message: "amount must be a positive integer" }, 400);
  }

  const userId = session.userId;
  await ensureBankingTables(env);
  await applyCreditInterest(env, userId);

  const card = await getUserCreditCard(env, userId);
  if (!card || String(card.status) !== "active") {
    return json({ success: false, message: "No active credit card found." }, 400);
  }

  let outstanding = Number(card.outstanding_balance || 0);
  let principalOutstanding = Number(card.principal_outstanding || 0);
  let interestOutstanding = Number(card.interest_outstanding || 0);
  const splitTotal = principalOutstanding + interestOutstanding;
  if (outstanding !== splitTotal) {
    principalOutstanding = Math.max(0, principalOutstanding + (outstanding - splitTotal));
  }
  if (outstanding <= 0) {
    const snapshot = await getUserBankingSnapshot(env, userId);
    return json({ success: true, message: "No outstanding credit balance.", ...snapshot });
  }

  const payAmount = Math.min(amount, outstanding);
  const pointsBalance = await getUserNetPoints(env, userId);
  if (pointsBalance < payAmount) {
    return json({
      success: false,
      message: `Insufficient points balance. Available: ${pointsBalance} pts.`,
    }, 400);
  }

  const deductStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, -payAmount, "Credit card bill payment", userId);

  const interestPaid = Math.min(payAmount, interestOutstanding);
  const principalPaid = Math.min(payAmount - interestPaid, principalOutstanding);
  const nextInterestOutstanding = Math.max(0, interestOutstanding - interestPaid);
  const nextPrincipalOutstanding = Math.max(0, principalOutstanding - principalPaid);
  const nextOutstanding = Math.max(0, outstanding - payAmount);
  const limit = Number(card.credit_limit || 0);
  const limitExhaustedNow = limit > 0 && nextOutstanding >= limit;
  const wasRewardBlocked = Number(card.reward_claim_blocked || 0) === 1;
  const shouldBlockRewardClaims = nextOutstanding > 0 && (wasRewardBlocked || limitExhaustedNow);

  const updateCardStmt = env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = ?,
        principal_outstanding = ?,
        interest_outstanding = ?,
        reward_claim_blocked = ?,
        reward_claim_blocked_at = CASE
          WHEN ? = 1 THEN COALESCE(reward_claim_blocked_at, datetime('now'))
          ELSE NULL
        END,
        last_payment_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    nextOutstanding,
    nextPrincipalOutstanding,
    nextInterestOutstanding,
    shouldBlockRewardClaims ? 1 : 0,
    shouldBlockRewardClaims ? 1 : 0,
    card.id
  );

  await env.DB.batch([deductStmt, updateCardStmt]);

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({
    success: true,
    message: `Credit bill payment successful. Bill before payment: principal ${principalOutstanding} pts + interest ${interestOutstanding} pts = total ${outstanding} pts. Paid principal ${principalPaid} pts and interest ${interestPaid} pts.`,
    payment_breakdown: {
      paid_total: payAmount,
      paid_principal: principalPaid,
      paid_interest: interestPaid,
      due_before_payment: {
        principal: principalOutstanding,
        interest: interestOutstanding,
        total: outstanding,
      },
      due_after_payment: {
        principal: nextPrincipalOutstanding,
        interest: nextInterestOutstanding,
        total: nextOutstanding,
      },
    },
    ...snapshot,
  });
}
