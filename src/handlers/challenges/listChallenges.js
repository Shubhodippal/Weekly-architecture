import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges
 * Returns all challenges (newest first). Any authenticated user can access.
 */
export async function handleListChallenges(request, env) {
  const { error } = await requireAuth(request, env);
  if (error) return error;

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.pdf_name, c.created_at,
            u.name AS posted_by_name
     FROM challenges c
     JOIN users u ON u.id = c.posted_by
     ORDER BY c.created_at DESC`
  ).all();

  // Annotate each challenge with whether its deadline has passed
  const now = new Date().toISOString().slice(0, 10);
  const challenges = results.map((c) => ({
    ...c,
    is_expired: c.last_date < now,
  }));

  return json({ success: true, challenges, total: challenges.length });
}
