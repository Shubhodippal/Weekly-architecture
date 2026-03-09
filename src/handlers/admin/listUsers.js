import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

export async function handleListUsers(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.last_login, u.created_at,
            COALESCE((SELECT SUM(s.points) FROM submissions s WHERE s.user_id = u.id), 0)
            + COALESCE((SELECT SUM(b.points) FROM bonus_points b WHERE b.user_id = u.id), 0)
            - COALESCE((SELECT SUM(ur.points_consumed) FROM user_rewards ur WHERE ur.user_id = u.id), 0)
            AS total_points
     FROM users u ORDER BY u.created_at DESC`
  ).all();

  return json({ success: true, users: results, total: results.length });
}
