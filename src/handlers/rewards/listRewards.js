import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/rewards
 * Returns all active reward tiers with the caller's status on each.
 * Also returns `new_unlocks` — rewards whose status is 'unlocked' (not yet acted on).
 */
export async function handleListRewards(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const userId = session.userId;

  // Compute net balance (earned + bonus − ALL consumed).
  const balRow = await env.DB.prepare(`
    SELECT
      COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = ?), 0)
      + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = ?), 0)
      - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = ?), 0)
      AS balance
  `).bind(userId, userId, userId).first();
  const netBalance = balRow?.balance ?? 0;

  // Step 1: Re-unlock any previously fulfilled reward the user can now afford again.
  await env.DB.prepare(`
    UPDATE user_rewards
    SET    status = 'unlocked', unlocked_at = datetime('now'),
           claimed_at = NULL, fulfilled_at = NULL
    WHERE  user_id = ?
    AND    status  = 'fulfilled'
    AND    reward_id IN (
      SELECT id FROM rewards WHERE active = 1 AND points_required <= ?
    )
  `).bind(userId, netBalance).run();

  // Step 2: Insert rows for rewards that have never been touched by this user.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO user_rewards (user_id, reward_id, status, unlocked_at)
    SELECT ?, r.id, 'unlocked', datetime('now')
    FROM   rewards r
    WHERE  r.active = 1
    AND    r.points_required <= ?
    AND    NOT EXISTS (
      SELECT 1 FROM user_rewards ur WHERE ur.user_id = ? AND ur.reward_id = r.id
    )
  `).bind(userId, netBalance, userId).run();

  const result = await env.DB.prepare(`
    SELECT r.id, r.title, r.description, r.icon, r.points_required,
           ur.status, ur.unlocked_at, ur.claimed_at, ur.fulfilled_at
    FROM   rewards r
    LEFT JOIN user_rewards ur ON ur.reward_id = r.id AND ur.user_id = ?
    WHERE  r.active = 1
    ORDER  BY r.points_required ASC
  `).bind(userId).all();

  const rewards = result.results.map((r) => {
    // Any reward the user can no longer afford re-locks visually (regardless of prior status).
    // 'claimed' is kept visible since it's pending admin action.
    // DB row is preserved so points_consumed stays accurate for balance calc.
    const relock = r.status !== null && r.status !== "claimed" && netBalance < r.points_required;
    const effective = relock ? null : r.status;

    return {
      id:              r.id,
      // Only expose title/description/icon for rewards the user has earned (and can afford)
      title:           effective ? r.title       : null,
      description:     effective ? r.description : null,
      icon:            effective ? r.icon        : null,
      points_required: r.points_required,
      status:          effective || "locked",
      unlocked_at:     r.unlocked_at  || null,
      claimed_at:      r.claimed_at   || null,
      fulfilled_at:    r.fulfilled_at || null,
    };
  });

  const new_unlocks = rewards.filter((r) => r.status === "unlocked");

  return json({ success: true, rewards, new_unlocks });
}
