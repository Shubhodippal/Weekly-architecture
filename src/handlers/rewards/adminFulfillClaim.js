import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * PATCH /api/admin/rewards/claims/:id/fulfill
 * Admin: mark a pending claim as fulfilled.
 */
export async function handleAdminFulfillClaim(request, env, claimId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(claimId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid claim ID" }, 400);

  // Fetch claim + reward cost in one join
  const claim = await env.DB.prepare(`
    SELECT ur.id, ur.status, ur.user_id, r.points_required, r.title
    FROM   user_rewards ur
    JOIN   rewards r ON r.id = ur.reward_id
    WHERE  ur.id = ?
  `).bind(id).first();

  if (!claim) return json({ success: false, message: "Claim not found" }, 404);
  if (claim.status !== "claimed") {
    return json({ success: false, message: "Claim is not in pending state" }, 400);
  }

  // Check user has enough balance (earned + bonus - ALL consumed so far across all cycles)
  const balRow = await env.DB.prepare(`
    SELECT
      COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = ?), 0)
      + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = ?), 0)
      - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = ?), 0)
      AS balance
  `).bind(claim.user_id, claim.user_id, claim.user_id).first();

  const balance = balRow?.balance ?? 0;
  if (balance < claim.points_required) {
    return json({
      success: false,
      message: `User only has ${balance} pts but this reward costs ${claim.points_required} pts`,
    }, 400);
  }

  const now = new Date().toISOString();
  // Accumulate points_consumed so all cycles are tracked (supports re-claiming same tier).
  await env.DB.prepare(
    "UPDATE user_rewards SET status = 'fulfilled', fulfilled_at = ?, points_consumed = points_consumed + ? WHERE id = ?"
  ).bind(now, claim.points_required, id).run();

  return json({ success: true, points_consumed: claim.points_required });
}
