import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * POST /api/rewards/:id/claim
 * User claims an unlocked reward; status → 'claimed' (pending admin fulfilment).
 */
export async function handleClaimReward(request, env, rewardId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  if (session.role === "admin") {
    return json({ success: false, message: "Admins cannot claim rewards" }, 403);
  }

  const id = parseInt(rewardId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid reward ID" }, 400);

  const row = await env.DB.prepare(`
    SELECT ur.id, ur.status, r.title
    FROM   user_rewards ur
    JOIN   rewards r ON r.id = ur.reward_id
    WHERE  ur.user_id = ? AND ur.reward_id = ?
  `).bind(session.userId, id).first();

  if (!row) return json({ success: false, message: "Reward not yet unlocked" }, 404);
  if (row.status !== "unlocked" && row.status !== "passed") {
    return json({ success: false, message: "Reward is already claimed or fulfilled" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE user_rewards SET status = 'claimed', claimed_at = ? WHERE user_id = ? AND reward_id = ?"
  ).bind(now, session.userId, id).run();

  return json({ success: true, message: "Reward claimed! The admin will reach out soon 🎉" });
}
