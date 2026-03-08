import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { ADMIN_EMAIL } from "../../config.js";

export async function handleDeleteUser(request, env, userId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(userId, 10);
  if (!id || isNaN(id)) {
    return json({ success: false, message: "Invalid user ID" }, 400);
  }

  const target = await env.DB.prepare(
    "SELECT email FROM users WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!target) {
    return json({ success: false, message: "User not found" }, 404);
  }

  // Protect the admin account from deletion
  if (target.email === ADMIN_EMAIL) {
    return json({ success: false, message: "Cannot delete the admin account" }, 403);
  }

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM otps WHERE email = ?").bind(target.email).run();

  return json({ success: true, message: "User deleted successfully" });
}
