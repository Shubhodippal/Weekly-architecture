import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

export async function handleMe(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const user = await env.DB.prepare(
    `SELECT id, name, email, role, last_login, created_at,
            (SELECT COALESCE(SUM(points), 0) FROM submissions WHERE user_id = users.id) AS total_points
     FROM users WHERE id = ?`
  )
    .bind(session.userId)
    .first();

  if (!user) return json({ success: false, message: "User not found" }, 404);

  return json({ success: true, user });
}
