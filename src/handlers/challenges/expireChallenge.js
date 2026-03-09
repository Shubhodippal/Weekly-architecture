import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * POST /api/challenges/:id/expire
 * Sets last_date to yesterday so the challenge becomes expired immediately.
 * Admin only.
 */
export async function handleExpireChallenge(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) {
    return json({ success: false, message: "Invalid challenge ID" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id, last_date FROM challenges WHERE id = ?"
  ).bind(id).first();

  if (!existing) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  // Set last_date to yesterday (string comparison will mark as expired)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await env.DB.prepare(
    "UPDATE challenges SET last_date = ? WHERE id = ?"
  ).bind(yesterday, id).run();

  // Auto-insert -10 penalty records for users who never submitted
  const { results: allUsers } = await env.DB.prepare(
    "SELECT id FROM users WHERE role = 'user'"
  ).all();

  const { results: submitters } = await env.DB.prepare(
    "SELECT user_id FROM submissions WHERE challenge_id = ?"
  ).bind(id).all();

  const submitterIds = new Set(submitters.map((s) => s.user_id));
  const now = new Date().toISOString();

  for (const user of allUsers) {
    if (!submitterIds.has(user.id)) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO submissions
           (challenge_id, user_id, solution_text, grade, points, submitted_at, updated_at)
         VALUES (?, ?, NULL, 'not_attempted', -10, ?, ?)`
      ).bind(id, user.id, now, now).run();
    }
  }

  return json({ success: true, message: "Challenge closed", last_date: yesterday });
}
