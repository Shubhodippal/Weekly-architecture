import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { ensureBankingTables, ensureUserDebitCard, getUserBankingSnapshot } from "../../utils/banking.js";
import { getUserNetPoints } from "../../utils/pointsFinance.js";

/**
 * POST /api/banking/debit/spend
 * Body: { amount: number, note?: string }
 */
export async function handleDebitSpend(request, env) {
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
  await ensureUserDebitCard(env, userId);

  const debitBalance = await getUserNetPoints(env, userId);
  if (debitBalance < amount) {
    return json({ success: false, message: `Insufficient debit balance. Available: ${debitBalance} pts.` }, 400);
  }

  const reason = note
    ? `Debit card spend: ${note}`
    : "Debit card spend";
  await env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, -amount, reason, userId).run();

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({ success: true, message: "Debit card transaction recorded.", ...snapshot });
}
