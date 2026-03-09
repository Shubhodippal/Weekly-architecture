import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { sendEvaluationEmail } from "../../utils/email.js";

const GRADE_POINTS = {
  wrong:   0,
  partial: 5,
  almost:  15,
  correct: 20,
};

const GRADE_LABELS = {
  wrong:   "Wrong",
  partial: "Partially Correct",
  almost:  "Almost Correct",
  correct: "Correct",
};

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

  const { grade, remark = "" } = body;
  if (!Object.prototype.hasOwnProperty.call(GRADE_POINTS, grade)) {
    return json({ success: false, message: "grade must be one of: wrong, partial, almost, correct" }, 400);
  }

  const points = GRADE_POINTS[grade];

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
