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

  const outstanding = Number(card.outstanding_balance || 0);
  if (outstanding <= 0) {
    const snapshot = await getUserBankingSnapshot(env, userId);
    return json({ success: true, message: "No outstanding credit balance.", ...snapshot });
  }

  const payAmount = Math.min(amount, outstanding);
  const debitBalance = await getUserNetPoints(env, userId);
  if (debitBalance < payAmount) {
    return json({
      success: false,
      message: `Insufficient debit balance. Available: ${debitBalance} pts.`,
    }, 400);
  }

  const deductStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, -payAmount, "Credit card bill payment", userId);

  const updateCardStmt = env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(outstanding - payAmount, card.id);

  await env.DB.batch([deductStmt, updateCardStmt]);

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({ success: true, message: "Credit card payment successful.", ...snapshot });
}
