import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

export async function handleListComments(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const sort = (url.searchParams.get("sort") || "top").toLowerCase() === "newest" ? "newest" : "top";

  const id = Number.parseInt(challengeId, 10);
  if (!id) return json({ success: false, message: "Invalid challenge ID" }, 400);

  const challenge = await env.DB.prepare("SELECT id FROM challenges WHERE id = ?").bind(id).first();
  if (!challenge) return json({ success: false, message: "Challenge not found" }, 404);

  const { results } = await env.DB.prepare(
      `SELECT c.id, c.challenge_id, c.parent_id, c.user_id, c.content, c.created_at, c.updated_at, c.is_pinned,
        c.is_hidden, c.hidden_reason,
        u.name AS author_name, u.role AS author_role,
        COALESCE(SUM(CASE WHEN r.reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes_count,
        COALESCE(SUM(CASE WHEN r.reaction = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes_count,
        ur.reaction AS my_reaction,
        EXISTS(
          SELECT 1 FROM comment_reports cr
          WHERE cr.comment_id = c.id AND cr.reported_by = ?
        ) AS is_reported_by_me
     FROM challenge_comments c
     JOIN users u ON u.id = c.user_id
       LEFT JOIN comment_reactions r ON r.comment_id = c.id
       LEFT JOIN comment_reactions ur ON ur.comment_id = c.id AND ur.user_id = ?
     WHERE c.challenge_id = ?
       GROUP BY c.id
       ORDER BY c.created_at ASC, c.id ASC`
    ).bind(session.userId, session.userId, id).all();

  const byId = new Map();
  const topLevel = [];

  for (const row of results) {
    const item = {
      id: row.id,
      challenge_id: row.challenge_id,
      parent_id: row.parent_id,
      user_id: row.user_id,
      author_name: row.author_name,
      author_role: row.author_role,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_pinned: Number(row.is_pinned) === 1,
      likes_count: Number(row.likes_count || 0),
      dislikes_count: Number(row.dislikes_count || 0),
      my_reaction: row.my_reaction || null,
      is_hidden: Number(row.is_hidden) === 1,
      hidden_reason: row.hidden_reason || null,
      is_reported_by_me: Number(row.is_reported_by_me) === 1,
      is_mine: Number(row.user_id) === Number(session.userId),
      can_delete: Number(row.user_id) === Number(session.userId) || session.role === "admin",
      can_edit: Number(row.user_id) === Number(session.userId) || session.role === "admin",
      can_pin: session.role === "admin" && !row.parent_id,
      can_hide: session.role === "admin",
      replies: [],
    };
    byId.set(item.id, item);
  }

  for (const item of byId.values()) {
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id).replies.push(item);
    } else {
      topLevel.push(item);
    }
  }

  topLevel.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (sort === "newest") {
      if (a.created_at === b.created_at) return b.id - a.id;
      return a.created_at < b.created_at ? 1 : -1;
    }
    const aScore = a.likes_count - a.dislikes_count;
    const bScore = b.likes_count - b.dislikes_count;
    if (aScore !== bScore) return bScore - aScore;
    if (a.likes_count !== b.likes_count) return b.likes_count - a.likes_count;
    if (a.created_at === b.created_at) return b.id - a.id;
    return a.created_at < b.created_at ? 1 : -1;
  });
  for (const parent of topLevel) {
    parent.replies.sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
  }

  return json({ success: true, comments: topLevel, total: results.length, sort });
}
