import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

export async function handleDeleteComment(request, env, commentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = Number.parseInt(commentId, 10);
  if (!id) return json({ success: false, message: "Invalid comment ID" }, 400);

  const comment = await env.DB.prepare(
    "SELECT id, user_id FROM challenge_comments WHERE id = ?"
  ).bind(id).first();

  if (!comment) return json({ success: false, message: "Comment not found" }, 404);

  const canDelete = Number(comment.user_id) === Number(session.userId) || session.role === "admin";
  if (!canDelete) {
    return json({ success: false, message: "Forbidden" }, 403);
  }

  await env.DB.prepare("DELETE FROM challenge_comments WHERE id = ?").bind(id).run();
  return json({ success: true, message: "Comment deleted" });
}
