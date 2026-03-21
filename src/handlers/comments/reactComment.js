import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

export async function handleReactComment(request, env, commentId) {
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

  const reactionRaw = typeof payload.reaction === "string" ? payload.reaction.trim().toLowerCase() : "";
  const reaction = reactionRaw === "like" || reactionRaw === "dislike" ? reactionRaw : null;

  const comment = await env.DB.prepare("SELECT id FROM challenge_comments WHERE id = ?").bind(id).first();
  if (!comment) return json({ success: false, message: "Comment not found" }, 404);

  if (!reaction) {
    await env.DB.prepare("DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ?")
      .bind(id, session.userId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO comment_reactions (comment_id, user_id, reaction, created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(comment_id, user_id)
       DO UPDATE SET reaction = excluded.reaction, created_at = datetime('now')`
    )
      .bind(id, session.userId, reaction)
      .run();
  }

  const counts = await env.DB.prepare(
    `SELECT
        COALESCE(SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes_count,
        COALESCE(SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes_count
     FROM comment_reactions
     WHERE comment_id = ?`
  ).bind(id).first();

  return json({
    success: true,
    message: "Reaction updated",
    reaction,
    likes_count: Number(counts?.likes_count || 0),
    dislikes_count: Number(counts?.dislikes_count || 0),
  });
}
