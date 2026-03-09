import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * DELETE /api/challenges/:id
 * Removes the D1 record and the R2 object.
 * Admin only.
 */
export async function handleDeleteChallenge(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) {
    return json({ success: false, message: "Invalid challenge ID" }, 400);
  }

  const challenge = await env.DB.prepare(
    "SELECT pdf_key FROM challenges WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!challenge) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  // Delete R2 object first, then D1 row
  await env.R2.delete(challenge.pdf_key);
  await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(id).run();

  return json({ success: true, message: "Challenge deleted successfully" });
}
