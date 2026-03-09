import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * DELETE /api/challenges/:id/my-submission
 * Deletes the user's submission if the challenge deadline hasn't passed.
 */
export async function handleDeleteMySubmission(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid ID" }, 400);

  const challenge = await env.DB.prepare(
    `SELECT last_date FROM challenges WHERE id = ?`
  ).bind(id).first();

  if (!challenge) return json({ success: false, message: "Challenge not found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  if (challenge.last_date < today) {
    return json({ success: false, message: "Challenge has closed — submission cannot be deleted." }, 403);
  }

  const submission = await env.DB.prepare(
    `SELECT id, file_key FROM submissions WHERE challenge_id = ? AND user_id = ?`
  ).bind(id, session.userId).first();

  if (!submission) return json({ success: false, message: "No submission found." }, 404);

  if (submission.file_key) {
    try { await env.R2.delete(submission.file_key); } catch (_) {}
  }

  await env.DB.prepare(
    `DELETE FROM submissions WHERE id = ?`
  ).bind(submission.id).run();

  return json({ success: true, message: "Submission deleted." });
}
