import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges
 * Returns all challenges (newest first). Any authenticated user can access.
 */
export async function handleListChallenges(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.pdf_name, c.created_at,
            c.answer_description, c.answer_key, c.answer_name,
            u.name AS posted_by_name,
            s.grade AS my_grade, s.remark AS my_remark,
            s.points AS my_points, s.evaluated_at AS my_evaluated_at
     FROM challenges c
     JOIN users u ON u.id = c.posted_by
     LEFT JOIN submissions s ON s.challenge_id = c.id AND s.user_id = ?
     ORDER BY c.created_at DESC`
  ).bind(session.userId).all();

  const isAdmin = session.role === "admin";
  const now = new Date().toISOString().slice(0, 10);
  const challenges = results.map((c) => {
    const isExpired = c.last_date < now;
    return {
      id:                 c.id,
      title:              c.title,
      description:        c.description,
      last_date:          c.last_date,
      pdf_name:           c.pdf_name,
      created_at:         c.created_at,
      posted_by_name:     c.posted_by_name,
      is_expired:         isExpired,
      // Reveal answer only after expiry
      answer_description: isExpired ? c.answer_description : null,
      answer_name:        isExpired ? c.answer_name        : null,
      has_answer:         isExpired ? !!c.answer_key       : false,
      // User's own evaluation (null for admin)
      my_grade:        isAdmin ? null : (c.my_grade       || null),
      my_remark:       isAdmin ? null : (c.my_remark      || null),
      my_points:       isAdmin ? null : (c.my_points      ?? null),
      my_evaluated_at: isAdmin ? null : (c.my_evaluated_at || null),
    };
  });

  return json({ success: true, challenges, total: challenges.length });
}
