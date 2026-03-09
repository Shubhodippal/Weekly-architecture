import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges/:id/my-submission
 * Returns the calling user's own submission for this challenge (or null).
 */
export async function handleGetMySubmission(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid ID" }, 400);

  const submission = await env.DB.prepare(
    `SELECT id, solution_text, file_name, file_type, submitted_at, updated_at,
            CASE WHEN file_key IS NOT NULL THEN 1 ELSE 0 END AS has_file
     FROM submissions
     WHERE challenge_id = ? AND user_id = ?`
  ).bind(id, session.userId).first();

  return json({ success: true, submission: submission || null });
}
