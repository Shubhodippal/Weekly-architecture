import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import {
  ensureBankingTables,
  ensureUserDebitCard,
  getUserBankingSnapshot,
  PAYOUT_MODES,
  payoutCycleDays,
  addDaysIso,
} from "../../utils/banking.js";
import { getFinanceRates, getUserNetPoints } from "../../utils/pointsFinance.js";

/**
 * POST /api/banking/investments/fd
 * Body: { principal_points: number, tenure_days: number, payout_mode: monthly|quarterly|yearly|closure|reinvest }
 */
export async function handleOpenFdInvestment(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const principalPoints = Number.parseInt(body?.principal_points, 10);
  const tenureDays = Number.parseInt(body?.tenure_days, 10);
  const payoutMode = String(body?.payout_mode || "closure").trim().toLowerCase();

  if (!Number.isInteger(principalPoints) || principalPoints <= 0) {
    return json({ success: false, message: "principal_points must be a positive integer" }, 400);
  }
  if (!Number.isInteger(tenureDays) || tenureDays < 1 || tenureDays > 3650) {
    return json({ success: false, message: "tenure_days must be between 1 and 3650" }, 400);
  }
  if (!PAYOUT_MODES.includes(payoutMode)) {
    return json({ success: false, message: "Invalid payout_mode" }, 400);
  }

  const userId = session.userId;
  await ensureBankingTables(env);
  await ensureUserDebitCard(env, userId);

  const debitBalance = await getUserNetPoints(env, userId);
  if (debitBalance < principalPoints) {
    return json({
      success: false,
      message: `Insufficient debit balance. Available: ${debitBalance} pts.`,
    }, 400);
  }

  const rates = await getFinanceRates(env, { ensure: true });
  const annualRate = Number(rates.fd || 0);
  const payoutEveryDays = payoutCycleDays(payoutMode);
  const openedAt = new Date();
  const openedIso = openedAt.toISOString();
  const maturityAt = addDaysIso(openedAt, tenureDays);
  const nextPayoutAt = payoutEveryDays > 0 ? addDaysIso(openedAt, payoutEveryDays) : null;

  const insertInvStmt = env.DB.prepare(`
    INSERT INTO point_investments
      (user_id, plan_type, principal_points, annual_rate, tenure_days, opened_at, maturity_at, status,
       recurring_amount, recurring_frequency, recurring_every_days, installments_total, installments_paid, next_installment_at,
       payout_mode, payout_every_days, next_payout_at, last_interest_calc_at, accrued_interest_points, interest_points, payout_points)
    VALUES
      (?, 'fd', ?, ?, ?, ?, ?, 'active',
       0, NULL, 0, 1, 1, NULL,
       ?, ?, ?, ?, 0, 0, 0)
  `).bind(userId, principalPoints, annualRate, tenureDays, openedIso, maturityAt, payoutMode, payoutEveryDays, nextPayoutAt, openedIso);

  const deductStmt = env.DB.prepare(`
    INSERT INTO bonus_points (user_id, points, reason, granted_by)
    VALUES (?, ?, ?, ?)
  `).bind(userId, -principalPoints, `FD opened: -${principalPoints} pts`, userId);

  await env.DB.batch([insertInvStmt, deductStmt]);

  const snapshot = await getUserBankingSnapshot(env, userId);
  return json({ success: true, message: "FD investment opened.", ...snapshot });
}
