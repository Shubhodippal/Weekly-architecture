import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

export async function handleAdminListCommentReports(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const { results } = await env.DB.prepare(
    `SELECT
        c.id AS comment_id,
        c.challenge_id,
        c.content,
        c.created_at,
        c.is_hidden,
        c.hidden_reason,
        au.name AS comment_author,
        ch.title AS challenge_title,
        COUNT(cr.id) AS report_count,
        MAX(cr.created_at) AS last_reported_at,
        GROUP_CONCAT(COALESCE(NULLIF(TRIM(cr.reason), ''), '(no reason)'), ' || ') AS reasons,
        GROUP_CONCAT(ru.name, ', ') AS reported_by
     FROM comment_reports cr
     JOIN challenge_comments c ON c.id = cr.comment_id
     JOIN users au ON au.id = c.user_id
     JOIN users ru ON ru.id = cr.reported_by
     JOIN challenges ch ON ch.id = c.challenge_id
     GROUP BY c.id
     ORDER BY datetime(last_reported_at) DESC`
  ).all();

  return json({ success: true, reports: results || [] });
}
