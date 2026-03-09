import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/admin/rewards/tiers
 * Admin: list all reward tiers (including inactive).
 */
export async function handleAdminListRewardTiers(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const result = await env.DB.prepare(
    "SELECT id, title, description, icon, points_required, active FROM rewards ORDER BY points_required ASC"
  ).all();

  return json({ success: true, tiers: result.results });
}
