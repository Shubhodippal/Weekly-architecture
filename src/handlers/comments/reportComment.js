import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

export async function handleReportComment(request, env, commentId) {
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

  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";

  const comment = await env.DB.prepare(
    "SELECT id, user_id FROM challenge_comments WHERE id = ?"
  ).bind(id).first();

  if (!comment) return json({ success: false, message: "Comment not found" }, 404);
  if (Number(comment.user_id) === Number(session.userId)) {
    return json({ success: false, message: "You cannot report your own comment" }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO comment_reports (comment_id, reported_by, reason, created_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(comment_id, reported_by)
     DO UPDATE SET reason = excluded.reason, created_at = datetime('now')`
  ).bind(id, session.userId, reason || null).run();

  return json({ success: true, message: "Comment reported. Thanks for your feedback." });
}
