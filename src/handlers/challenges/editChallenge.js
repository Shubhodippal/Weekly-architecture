import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * PATCH /api/challenges/:id
 * Body (JSON): { title, description, last_date }
 * Admin only. PDF is not changed here.
 */
export async function handleEditChallenge(request, env, id) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Expected JSON body" }, 400);
  }

  const title       = (body.title       || "").trim();
  const description = (body.description ?? "").trim();
  const lastDate    = (body.last_date   || "").trim();

  if (!title) {
    return json({ success: false, message: "Title is required" }, 400);
  }
  if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    return json({ success: false, message: "last_date must be YYYY-MM-DD" }, 400);
  }

  // Check challenge exists
  const existing = await env.DB.prepare(
    `SELECT id FROM challenges WHERE id = ?`
  ).bind(id).first();

  if (!existing) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  await env.DB.prepare(
    `UPDATE challenges SET title = ?, description = ?, last_date = ? WHERE id = ?`
  ).bind(title, description || null, lastDate, id).run();

  const updated = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.pdf_name, c.created_at,
            u.name AS posted_by_name
     FROM challenges c
     JOIN users u ON u.id = c.posted_by
     WHERE c.id = ?`
  ).bind(id).first();

  return json({ success: true, message: "Challenge updated", challenge: updated });
}
