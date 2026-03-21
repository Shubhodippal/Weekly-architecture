import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

export async function handlePinComment(request, env, commentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = Number.parseInt(commentId, 10);
  if (!id) return json({ success: false, message: "Invalid comment ID" }, 400);

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  if (typeof payload.is_pinned !== "boolean") {
    return json({ success: false, message: "is_pinned must be boolean" }, 400);
  }

  const comment = await env.DB.prepare(
    "SELECT id, challenge_id, parent_id FROM challenge_comments WHERE id = ?"
  ).bind(id).first();

  if (!comment) return json({ success: false, message: "Comment not found" }, 404);
  if (comment.parent_id) {
    return json({ success: false, message: "Only top-level comments can be pinned" }, 400);
  }

  if (payload.is_pinned) {
    await env.DB.prepare("UPDATE challenge_comments SET is_pinned = 0 WHERE challenge_id = ?")
      .bind(comment.challenge_id)
      .run();
    await env.DB.prepare("UPDATE challenge_comments SET is_pinned = 1 WHERE id = ?")
      .bind(id)
      .run();
  } else {
    await env.DB.prepare("UPDATE challenge_comments SET is_pinned = 0 WHERE id = ?")
      .bind(id)
      .run();
  }

  return json({ success: true, message: payload.is_pinned ? "Comment pinned" : "Comment unpinned" });
}
