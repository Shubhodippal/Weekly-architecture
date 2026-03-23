import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  addDaysIso,
  ensureBankingTables,
  PAYOUT_MODES,
  payoutCycleDays,
  RD_FREQUENCIES,
  getUserBankingSnapshot,
} from "../../utils/banking.js";
import { getFinanceRates, getUserNetPoints } from "../../utils/pointsFinance.js";

/**
 * POST /api/banking/investments/rd
 * Body:
 * {
 *   recurring_amount: number,
 *   recurring_frequency: daily|weekly|monthly,
 *   installments_total: number,
 *   payout_mode: monthly|quarterly|yearly|closure|reinvest
 * }
 */
export async function handleOpenRdInvestment(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const recurringAmount = Number.parseInt(body?.recurring_amount, 10);
  const recurringFrequency = String(body?.recurring_frequency || "").trim().toLowerCase();
  const installmentsTotal = Number.parseInt(body?.installments_total, 10);
  const payoutMode = String(body?.payout_mode || "closure").trim().toLowerCase();

  if (!Number.isInteger(recurringAmount) || recurringAmount <= 0) {
    return json({ success: false, message: "recurring_amount must be a positive integer" }, 400);
  }
  if (!Object.prototype.hasOwnProperty.call(RD_FREQUENCIES, recurringFrequency)) {
    return json({ success: false, message: "recurring_frequency must be daily, weekly, or monthly" }, 400);
  }
  if (!Number.isInteger(installmentsTotal) || installmentsTotal < 1 || installmentsTotal > 240) {
    return json({ success: false, message: "installments_total must be between 1 and 240" }, 400);
  }
  if (!PAYOUT_MODES.includes(payoutMode)) {
    return json({ success: false, message: "Invalid payout_mode" }, 400);
  }

  const userId = session.userId;
  await ensureBankingTables(env);

  const pointsBalance = await getUserNetPoints(env, userId);
  if (pointsBalance < recurringAmount) {
    return json({
      success: false,
      message: `Insufficient points balance. Available: ${pointsBalance} pts.`,
    }, 400);
  }

  const rates = await getFinanceRates(env, { ensure: true });
  const annualRate = Number(rates.rd || 0);
  const recurringEveryDays = Number(RD_FREQUENCIES[recurringFrequency]);
  const tenureDays = recurringEveryDays * installmentsTotal;
  const payoutEveryDays = payoutCycleDays(payoutMode);

  const openedAt = new Date();
  const openedIso = openedAt.toISOString();
  const maturityAt = addDaysIso(openedAt, tenureDays);
  const nextInstallmentAt = installmentsTotal > 1
    ? addDaysIso(openedAt, recurringEveryDays)
    : null;
  const nextPayoutAt = payoutEveryDays > 0 ? addDaysIso(openedAt, payoutEveryDays) : null;

  const insertInvStmt = env.DB.prepare(`
    INSERT INTO point_investments
      (user_id, plan_type, principal_points, annual_rate, tenure_days, opened_at, maturity_at, status,
       recurring_amount, recurring_frequency, recurring_every_days, installments_total, installments_paid, next_installment_at,
       payout_mode, payout_every_days, next_payout_at, last_interest_calc_at, accrued_interest_points, interest_points, payout_points)
    VALUES
      (?, 'rd', ?, ?, ?, ?, ?, 'active',
       ?, ?, ?, ?, 1, ?,
       ?, ?, ?, ?, 0, 0, 0)
  `).bind(
    userId,
    recurringAmount,
    annualRate,
    tenureDays,
    openedIso,
    maturityAt,
    recurringAmount,
    recurringFrequency,
    recurringEveryDays,
    installmentsTotal,
    nextInstallmentAt,
    payoutMode,
    payoutEveryDays,
    nextPayoutAt,
    openedIso
  );

  const deductStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, -recurringAmount, `RD opened: first installment -${recurringAmount} pts`, userId);

  await env.DB.batch([insertInvStmt, deductStmt]);

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({ success: true, message: "RD investment opened.", ...snapshot });
}
