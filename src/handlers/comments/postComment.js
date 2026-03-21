import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { hasProfanity, profanityMessage } from "../../utils/commentModeration.js";

export async function handlePostComment(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = Number.parseInt(challengeId, 10);
  if (!id) return json({ success: false, message: "Invalid challenge ID" }, 400);

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  const parentId = payload.parent_id ? Number.parseInt(payload.parent_id, 10) : null;

  if (!content) return json({ success: false, message: "Comment content is required" }, 400);
  if (content.length > 2000) return json({ success: false, message: "Comment is too long (max 2000 chars)" }, 400);
  if (hasProfanity(content)) return json({ success: false, message: profanityMessage() }, 400);

  const challenge = await env.DB.prepare("SELECT id FROM challenges WHERE id = ?").bind(id).first();
  if (!challenge) return json({ success: false, message: "Challenge not found" }, 404);

  const recent = await env.DB.prepare(
    `SELECT created_at
     FROM challenge_comments
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(session.userId).first();

  if (recent?.created_at) {
    const lastTime = new Date(recent.created_at).getTime();
    const nowTime = Date.now();
    const seconds = Math.floor((nowTime - lastTime) / 1000);
    const cooldownSeconds = 15;
    if (seconds < cooldownSeconds) {
      return json({
        success: false,
        message: `You're commenting too fast. Please wait ${cooldownSeconds - Math.max(0, seconds)}s.`,
      }, 429);
    }
  }

  if (parentId) {
    const parent = await env.DB.prepare(
      "SELECT id, challenge_id FROM challenge_comments WHERE id = ?"
    ).bind(parentId).first();

    if (!parent) return json({ success: false, message: "Parent comment not found" }, 404);
    if (Number(parent.challenge_id) !== id) {
      return json({ success: false, message: "Parent comment belongs to another challenge" }, 400);
    }
  }

  const insert = await env.DB.prepare(
    `INSERT INTO challenge_comments (challenge_id, user_id, parent_id, content)
     VALUES (?, ?, ?, ?)`
  ).bind(id, session.userId, parentId, content).run();

  const created = await env.DB.prepare(
    `SELECT c.id, c.challenge_id, c.parent_id, c.user_id, c.content, c.created_at, c.updated_at,
            u.name AS author_name, u.role AS author_role
     FROM challenge_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = ?`
  ).bind(insert.meta.last_row_id).first();

  return json({
    success: true,
    message: "Comment posted",
    comment: {
      ...created,
      is_mine: true,
      can_delete: true,
      can_edit: true,
      replies: [],
    },
  }, 201);
}
