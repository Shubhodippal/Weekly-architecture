import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  applyCreditInterest,
  ensureBankingTables,
  getUserBankingSnapshot,
  getUserCreditCard,
} from "../../utils/banking.js";

/**
 * POST /api/banking/credit/borrow
 * Body: { amount: number, note?: string }
 */
export async function handleCreditBorrow(request, env) {
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
  const note = String(body?.note || "").trim().slice(0, 120);

  const userId = session.userId;
  await ensureBankingTables(env);
  await applyCreditInterest(env, userId);

  const card = await getUserCreditCard(env, userId);
  if (!card || String(card.status) !== "active") {
    return json({ success: false, message: "Apply for a credit card first." }, 400);
  }

  const currentOutstanding = Number(card.outstanding_balance || 0);
  let principalOutstanding = Number(card.principal_outstanding || 0);
  const interestOutstanding = Number(card.interest_outstanding || 0);
  const splitTotal = principalOutstanding + interestOutstanding;
  if (currentOutstanding !== splitTotal) {
    principalOutstanding = Math.max(0, principalOutstanding + (currentOutstanding - splitTotal));
  }
  const limit = Number(card.credit_limit || 0);
  const available = Math.max(0, limit - currentOutstanding);
  if (amount > available) {
    return json({
      success: false,
      message: `Credit limit exceeded. Available to borrow: ${available} pts.`,
    }, 400);
  }

  const reason = note ? `Borrowed on credit: ${note}` : "Borrowed on credit";
  const nextOutstanding = currentOutstanding + amount;
  const shouldBlockRewardClaims = limit > 0 && nextOutstanding >= limit;

  const updateCardStmt = env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = ?,
        principal_outstanding = ?,
        reward_claim_blocked = CASE WHEN ? = 1 THEN 1 ELSE reward_claim_blocked END,
        reward_claim_blocked_at = CASE
          WHEN ? = 1 THEN COALESCE(reward_claim_blocked_at, datetime('now'))
          ELSE reward_claim_blocked_at
        END,
        last_borrowed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    nextOutstanding,
    principalOutstanding + amount,
    shouldBlockRewardClaims ? 1 : 0,
    shouldBlockRewardClaims ? 1 : 0,
    card.id
  );

  const creditPointsStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, amount, reason, userId);

  await env.DB.batch([updateCardStmt, creditPointsStmt]);

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({ success: true, message: "Points borrowed on credit.", ...snapshot });
}
