import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * POST /api/challenges/:id/reopen
 * Body (JSON): { last_date: "YYYY-MM-DD" }
 * Sets last_date to a future date to reopen the challenge for submissions.
 * Admin only.
 */
export async function handleReopenChallenge(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) {
    return json({ success: false, message: "Invalid challenge ID" }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Expected JSON body" }, 400);
  }

  const lastDate = (body.last_date || "").trim();
  if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    return json({ success: false, message: "last_date must be in YYYY-MM-DD format" }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (lastDate <= today) {
    return json({ success: false, message: "New deadline must be in the future" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM challenges WHERE id = ?"
  ).bind(id).first();

  if (!existing) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  await env.DB.prepare(
    "UPDATE challenges SET last_date = ? WHERE id = ?"
  ).bind(lastDate, id).run();

  return json({ success: true, message: "Challenge reopened", last_date: lastDate });
}
