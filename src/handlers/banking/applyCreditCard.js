import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  ensureBankingTables,
  generateCardLast4,
  getBankingMetaSettings,
  getUserCreditCard,
  getUserBankingSnapshot,
} from "../../utils/banking.js";

/**
 * POST /api/banking/credit-card/apply
 * User applies for a credit card (auto-activates with default limit/rate).
 */
export async function handleApplyCreditCard(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const userId = session.userId;
  await ensureBankingTables(env);

  const existing = await getUserCreditCard(env, userId);
  if (existing && String(existing.status) === "active") {
    const snapshot = await getUserBankingSnapshot(env, userId);
    return json({
      success: true,
      message: "Credit card is already active.",
      ...snapshot,
    });
  }

  const meta = await getBankingMetaSettings(env, { ensure: true });
  const creditMonthlyRate = Number(meta.credit_monthly_rate ?? meta.credit_annual_rate ?? 0);
  const last4 = generateCardLast4();

  if (existing) {
    await env.DB.prepare(`
      UPDATE bank_cards
      SET status = 'active',
          card_last4 = ?,
          credit_limit = ?,
          annual_interest_rate = ?,
          interest_last_applied_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(last4, meta.default_credit_limit, creditMonthlyRate, existing.id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO bank_cards
        (user_id, card_type, status, card_last4, credit_limit, outstanding_balance, annual_interest_rate, interest_last_applied_at, created_at, updated_at)
      VALUES
        (?, 'credit', 'active', ?, ?, 0, ?, datetime('now'), datetime('now'), datetime('now'))
    `).bind(userId, last4, meta.default_credit_limit, creditMonthlyRate).run();
  }

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({
    success: true,
    message: "Credit card activated successfully.",
    ...snapshot,
  });
}
