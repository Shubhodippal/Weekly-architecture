import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  applyCreditInterest,
  ensureBankingTables,
  getUserBankingSnapshot,
  getUserCreditCard,
} from "../../utils/banking.js";

/**
 * POST /api/banking/credit/spend
 * Body: { amount: number, note?: string }
 */
export async function handleCreditSpend(request, env) {
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
    return json({ success: false, message: "Apply for a credit card first." }, 400);
  }

  const currentOutstanding = Number(card.outstanding_balance || 0);
  const limit = Number(card.credit_limit || 0);
  const available = Math.max(0, limit - currentOutstanding);
  if (amount > available) {
    return json({
      success: false,
      message: `Credit limit exceeded. Available credit: ${available} pts.`,
    }, 400);
  }

  await env.DB.prepare(`
    UPDATE bank_cards
    SET outstanding_balance = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(currentOutstanding + amount, card.id).run();

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({ success: true, message: "Credit card spend recorded.", ...snapshot });
}
