import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { computeStreakStats } from "../../utils/streaks.js";

export async function handleMe(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const user = await env.DB.prepare(
    `SELECT id, name, email, role, last_login, created_at,
            (
              COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = users.id), 0)
              + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = users.id), 0)
              - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = users.id), 0)
            ) AS total_points
     FROM users WHERE id = ?`
  )
    .bind(session.userId)
    .first();

  if (!user) return json({ success: false, message: "User not found" }, 404);

  const dateRows = await env.DB.prepare(
    `SELECT submitted_at
     FROM submissions
     WHERE user_id = ? AND submitted_at IS NOT NULL`
  ).bind(session.userId).all();

  const streak = computeStreakStats((dateRows.results || []).map((row) => row.submitted_at));

  user.current_streak = streak.currentStreak;
  user.best_streak = streak.bestStreak;
  user.last_active_date = streak.lastActiveDate;

  return json({ success: true, user });
}
