import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges/:id/submissions
 * Admin-only: returns all submissions for the given challenge.
 */
export async function handleListSubmissions(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid ID" }, 400);

  const { results } = await env.DB.prepare(
    `SELECT s.id, u.name AS user_name, u.email AS user_email,
            s.solution_text, s.file_name, s.file_type,
            s.submitted_at, s.updated_at,
            CASE WHEN s.file_key IS NOT NULL THEN 1 ELSE 0 END AS has_file
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.challenge_id = ?
     ORDER BY s.submitted_at DESC`
  ).bind(id).all();

  return json({ success: true, submissions: results });
}
