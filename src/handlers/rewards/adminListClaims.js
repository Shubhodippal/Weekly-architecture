import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/admin/rewards/claims?status=claimed|fulfilled|all
 * Admin: list reward claims (default: pending only).
 */
export async function handleAdminListClaims(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const url    = new URL(request.url);
  const status = url.searchParams.get("status") || "claimed";

  let whereClause;
  if (status === "all")       whereClause = "ur.status IN ('claimed','fulfilled')";
  else if (status === "fulfilled") whereClause = "ur.status = 'fulfilled'";
  else                        whereClause = "ur.status = 'claimed'";

  const result = await env.DB.prepare(`
    SELECT ur.id, ur.status, ur.unlocked_at, ur.claimed_at, ur.fulfilled_at,
           ur.points_consumed,
           u.id   AS user_id,   u.name   AS user_name,   u.email  AS user_email,
           r.id   AS reward_id, r.title  AS reward_title, r.icon  AS reward_icon,
           r.points_required
    FROM   user_rewards ur
    JOIN   users   u ON u.id = ur.user_id
    JOIN   rewards r ON r.id = ur.reward_id
    WHERE  ${whereClause}
    ORDER  BY ur.claimed_at DESC
  `).all();

  return json({ success: true, claims: result.results });
}
