import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { getGradingPoints } from "../../utils/gradingSettings.js";
import { getHintCosts } from "../../utils/hintCosts.js";
import { getFinanceRates } from "../../utils/pointsFinance.js";
import { getBankingMetaSettings } from "../../utils/banking.js";

/**
 * GET /api/admin/grading/settings
 * Admin: read current grade->points mapping.
 */
export async function handleAdminGetGradingSettings(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const [settings, hintCosts, financeRates, bankingMeta] = await Promise.all([
    getGradingPoints(env, { ensure: true }),
    getHintCosts(env, { ensure: true }),
    getFinanceRates(env, { ensure: true }),
    getBankingMetaSettings(env, { ensure: true }),
  ]);

  return json({
    success: true,
    settings,
    hint_costs: hintCosts,
    finance_rates: financeRates,
    banking_meta: bankingMeta,
  });
}
