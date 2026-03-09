import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * PATCH /api/admin/rewards/claims/:id/reject
 * Admin: reject a pending claim, resetting it back to 'unlocked' so the
 * user can claim again later.
 */
export async function handleAdminRejectClaim(request, env, claimId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(claimId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid claim ID" }, 400);

  const claim = await env.DB.prepare(`
    SELECT ur.id, ur.status, r.title
    FROM   user_rewards ur
    JOIN   rewards r ON r.id = ur.reward_id
    WHERE  ur.id = ?
  `).bind(id).first();

  if (!claim) return json({ success: false, message: "Claim not found" }, 404);
  if (claim.status !== "claimed") {
    return json({ success: false, message: "Claim is not in pending state" }, 400);
  }

  // Reset to 'unlocked' so the user can choose to claim (or pass) again.
  await env.DB.prepare(
    "UPDATE user_rewards SET status = 'unlocked', claimed_at = NULL WHERE id = ?"
  ).bind(id).run();

  return json({ success: true });
}
