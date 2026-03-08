import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

export async function handleListUsers(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const { results } = await env.DB.prepare(
    "SELECT id, name, email, role, last_login, created_at FROM users ORDER BY created_at DESC"
  ).all();

  return json({ success: true, users: results, total: results.length });
}
