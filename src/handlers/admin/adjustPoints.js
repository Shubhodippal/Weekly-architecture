import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * PATCH /api/admin/users/:id/points
 * Admin: add bonus points for a user by inserting a bonus submission row.
 * Body: { points: number, reason?: string }
 */
export async function handleAdjustPoints(request, env, userId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(userId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid user ID" }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ success: false, message: "Invalid JSON" }, 400); }

  const points = parseInt(body.points, 10);
  if (!points || isNaN(points)) return json({ success: false, message: "points must be a non-zero integer" }, 400);

  // Verify target user exists and is not another admin
  const target = await env.DB.prepare("SELECT id, name, email, role FROM users WHERE id = ?").bind(id).first();
  if (!target) return json({ success: false, message: "User not found" }, 404);

  // Insert into bonus_points table
  const reason = String(body.reason || "Admin bonus").slice(0, 200);
  await env.DB.prepare(
    `INSERT INTO bonus_points (user_id, points, reason, granted_by) VALUES (?, ?, ?, ?)`
  ).bind(id, points, reason, session.userId).run();

  // Return new net balance (submissions + bonus - consumed)
  const balRow = await env.DB.prepare(`
    SELECT
      COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = ?), 0)
      + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = ?), 0)
      - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = ?), 0)
      AS balance
  `).bind(id, id, id).first();

  return json({
    success: true,
    message: `${points > 0 ? "+" : ""}${points} pts applied to ${target.name}`,
    new_balance: balRow?.balance ?? 0,
  });
}
