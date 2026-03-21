import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

export async function handleHideComment(request, env, commentId) {
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

  const isHidden = Boolean(payload.is_hidden);
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";

  const comment = await env.DB.prepare("SELECT id FROM challenge_comments WHERE id = ?").bind(id).first();
  if (!comment) return json({ success: false, message: "Comment not found" }, 404);

  if (isHidden) {
    await env.DB.prepare(
      `UPDATE challenge_comments
       SET is_hidden = 1,
           hidden_reason = ?,
           hidden_by = ?,
           hidden_at = datetime('now')
       WHERE id = ?`
    ).bind(reason || null, session.userId, id).run();
    return json({ success: true, message: "Comment hidden" });
  }

  await env.DB.prepare(
    `UPDATE challenge_comments
     SET is_hidden = 0,
         hidden_reason = NULL,
         hidden_by = NULL,
         hidden_at = NULL
     WHERE id = ?`
  ).bind(id).run();

  return json({ success: true, message: "Comment unhidden" });
}
