import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { getUserBankingSnapshot } from "../../utils/banking.js";

/**
 * GET /api/banking/overview
 * User: get points balance, credit card state, and FD/RD investments.
 */
export async function handleBankingOverview(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const snapshot = await getUserBankingSnapshot(env, session.userId);
  return json({ success: true, ...snapshot });
}
