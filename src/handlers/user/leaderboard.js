import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { computeStreakStats } from "../../utils/streaks.js";

export async function handleLeaderboard(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const { results: users } = await env.DB.prepare(
    `SELECT id, name, role,
            (
              COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = users.id), 0)
              + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = users.id), 0)
              - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = users.id), 0)
            ) AS total_points
     FROM users
     WHERE role != 'admin'
     ORDER BY total_points DESC, name ASC`
  ).all();

  const { results: activityRows } = await env.DB.prepare(
    `SELECT user_id, submitted_at
     FROM submissions
     WHERE submitted_at IS NOT NULL`
  ).all();

  const byUser = new Map();
  for (const row of activityRows || []) {
    const userId = Number(row.user_id);
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push(row.submitted_at);
  }

  const leaderboard = (users || []).map((user, idx) => {
    const streak = computeStreakStats(byUser.get(Number(user.id)) || []);
    return {
      rank: idx + 1,
      user_id: user.id,
      name: user.name,
      total_points: Number(user.total_points || 0),
      current_streak: streak.currentStreak,
      best_streak: streak.bestStreak,
      is_me: Number(user.id) === Number(session.userId),
    };
  });

  return json({
    success: true,
    leaderboard: leaderboard.slice(0, 10),
    me: leaderboard.find((row) => row.is_me) || null,
  });
}
