import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

export async function handleAdminClearCommentReports(request, env, commentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = Number.parseInt(commentId, 10);
  if (!id) return json({ success: false, message: "Invalid comment ID" }, 400);

  await env.DB.prepare("DELETE FROM comment_reports WHERE comment_id = ?").bind(id).run();
  return json({ success: true, message: "Reports cleared" });
}
