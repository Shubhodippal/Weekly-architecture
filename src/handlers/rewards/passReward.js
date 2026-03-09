import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * POST /api/rewards/:id/pass
 * User skips this reward to save points for a bigger one; status → 'passed'.
 */
export async function handlePassReward(request, env, rewardId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  if (session.role === "admin") {
    return json({ success: false, message: "Admins cannot pass rewards" }, 403);
  }

  const id = parseInt(rewardId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid reward ID" }, 400);

  const row = await env.DB.prepare(
    "SELECT id, status FROM user_rewards WHERE user_id = ? AND reward_id = ?"
  ).bind(session.userId, id).first();

  if (!row) return json({ success: false, message: "Reward not yet unlocked" }, 404);
  if (row.status !== "unlocked") {
    return json({ success: false, message: "Reward is already claimed or passed" }, 400);
  }

  await env.DB.prepare(
    "UPDATE user_rewards SET status = 'passed' WHERE user_id = ? AND reward_id = ?"
  ).bind(session.userId, id).run();

  return json({ success: true });
}
