import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { hasProfanity, profanityMessage } from "../../utils/commentModeration.js";

export async function handleUpdateComment(request, env, commentId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = Number.parseInt(commentId, 10);
  if (!id) return json({ success: false, message: "Invalid comment ID" }, 400);

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!content) return json({ success: false, message: "Comment content is required" }, 400);
  if (content.length > 2000) return json({ success: false, message: "Comment is too long (max 2000 chars)" }, 400);
  if (hasProfanity(content)) return json({ success: false, message: profanityMessage() }, 400);

  const comment = await env.DB.prepare(
    `SELECT id, user_id
     FROM challenge_comments
     WHERE id = ?`
  ).bind(id).first();

  if (!comment) return json({ success: false, message: "Comment not found" }, 404);

  const canEdit = Number(comment.user_id) === Number(session.userId) || session.role === "admin";
  if (!canEdit) {
    return json({ success: false, message: "Forbidden" }, 403);
  }

  await env.DB.prepare(
    `UPDATE challenge_comments
     SET content = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(content, id).run();

  const updated = await env.DB.prepare(
    `SELECT c.id, c.challenge_id, c.parent_id, c.user_id, c.content, c.created_at, c.updated_at,
            u.name AS author_name, u.role AS author_role
     FROM challenge_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = ?`
  ).bind(id).first();

  return json({
    success: true,
    message: "Comment updated",
    comment: {
      ...updated,
      is_mine: Number(updated.user_id) === Number(session.userId),
      can_delete: Number(updated.user_id) === Number(session.userId) || session.role === "admin",
      can_edit: Number(updated.user_id) === Number(session.userId) || session.role === "admin",
    },
  });
}
