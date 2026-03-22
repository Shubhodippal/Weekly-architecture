import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { sendEvaluationEmail } from "../../utils/email.js";
import { getGradingPoints, GRADE_LABELS } from "../../utils/gradingSettings.js";

/**
 * PATCH /api/submissions/:id/grade
 * Admin only. Grades a submission, updates points, sends email to the user.
 */
export async function handleGradeSubmission(request, env, submissionId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(submissionId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid submission ID" }, 400);

  let body;
  try { body = await request.json(); }
  catch { return json({ success: false, message: "Invalid JSON body" }, 400); }

  const gradePoints = await getGradingPoints(env);
  const { grade, remark = "" } = body;
  if (!Object.prototype.hasOwnProperty.call(gradePoints, grade)) {
    return json({ success: false, message: "grade must be one of: wrong, partial, almost, correct" }, 400);
  }

  const points = gradePoints[grade];

  // Fetch submission + user + challenge info for email
  const row = await env.DB.prepare(`
    SELECT s.id, s.user_id, s.challenge_id,
           u.name AS user_name, u.email AS user_email,
           c.title AS challenge_title
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN challenges c ON c.id = s.challenge_id
    WHERE s.id = ?
  `).bind(id).first();

  if (!row) return json({ success: false, message: "Submission not found" }, 404);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE submissions SET grade = ?, remark = ?, points = ?, evaluated_at = ? WHERE id = ?"
  ).bind(grade, remark.trim(), points, now, id).run();

  // Auto-unlock rewards based on new total points (non-blocking)
  try {
    const totRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(points), 0) AS total FROM submissions WHERE user_id = ?"
    ).bind(row.user_id).first();
    const newTotal = totRow?.total ?? 0;

    const newRewards = await env.DB.prepare(`
      SELECT r.id FROM rewards r
      WHERE  r.active = 1
      AND    r.points_required <= ?
      AND    NOT EXISTS (
        SELECT 1 FROM user_rewards ur WHERE ur.user_id = ? AND ur.reward_id = r.id
      )
    `).bind(newTotal, row.user_id).all();

    const unlockTime = new Date().toISOString();
    for (const reward of newRewards.results) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO user_rewards (user_id, reward_id, status, unlocked_at) VALUES (?, ?, 'unlocked', ?)"
      ).bind(row.user_id, reward.id, unlockTime).run();
    }
  } catch (e) {
    console.error("[gradeSubmission] reward unlock failed:", e);
  }

  // Email notification (non-blocking failure)
  try {
    await sendEvaluationEmail({
      to:             row.user_email,
      name:           row.user_name,
      challengeTitle: row.challenge_title,
      grade:          GRADE_LABELS[grade],
      points,
      remark:         remark.trim(),
    });
  } catch (e) {
    console.error("[gradeSubmission] email failed:", e);
  }

  return json({ success: true, grade, points, remark: remark.trim() });
}
