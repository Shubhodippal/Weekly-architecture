import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * PATCH /api/challenges/:id
 * Content-Type: multipart/form-data
 * Fields: title, description (optional), last_date, answer_description (optional),
 *         answer_pdf (optional file), remove_answer_pdf ("1" to clear existing answer file)
 * Admin only.
 */
export async function handleEditChallenge(request, env, id) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, message: "Expected multipart/form-data" }, 400);
  }

  const title             = (formData.get("title")              || "").trim();
  const description       = (formData.get("description")        ?? "").trim();
  const lastDate          = (formData.get("last_date")          || "").trim();
  const answerDescription = (formData.get("answer_description") ?? "").trim();
  const removeAnswerPdf   = formData.get("remove_answer_pdf") === "1";
  const answerPdfFile     = formData.get("answer_pdf");

  if (!title) {
    return json({ success: false, message: "Title is required" }, 400);
  }
  if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    return json({ success: false, message: "last_date must be YYYY-MM-DD" }, 400);
  }

  const MAX_BYTES = 20 * 1024 * 1024;
  if (answerPdfFile && typeof answerPdfFile !== "string" && answerPdfFile.size > 0) {
    if (answerPdfFile.type && answerPdfFile.type !== "application/pdf") {
      return json({ success: false, message: "Answer file must be a PDF" }, 400);
    }
    if (answerPdfFile.size > MAX_BYTES) {
      return json({ success: false, message: "Answer PDF must be smaller than 20 MB" }, 400);
    }
  }

  // Check challenge exists and get current answer_key
  const existing = await env.DB.prepare(
    `SELECT id, answer_key FROM challenges WHERE id = ?`
  ).bind(id).first();

  if (!existing) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  // Determine new answer_key / answer_name
  let newAnswerKey  = existing.answer_key;
  let newAnswerName = null;

  // Fetch current answer_name if not replacing
  const currentRow = await env.DB.prepare(
    `SELECT answer_name FROM challenges WHERE id = ?`
  ).bind(id).first();
  newAnswerName = currentRow?.answer_name || null;

  if (answerPdfFile && typeof answerPdfFile !== "string" && answerPdfFile.size > 0) {
    // Upload new answer PDF — delete old one if present
    if (existing.answer_key) {
      await env.R2.delete(existing.answer_key).catch(() => {});
    }
    newAnswerKey  = `answers/${crypto.randomUUID()}.pdf`;
    newAnswerName = answerPdfFile.name || "answer.pdf";
    const buf = await answerPdfFile.arrayBuffer();
    await env.R2.put(newAnswerKey, buf, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { originalName: newAnswerName },
    });
  } else if (removeAnswerPdf) {
    // Remove existing answer file
    if (existing.answer_key) {
      await env.R2.delete(existing.answer_key).catch(() => {});
    }
    newAnswerKey  = null;
    newAnswerName = null;
  }

  await env.DB.prepare(
    `UPDATE challenges
     SET title = ?, description = ?, last_date = ?,
         answer_description = ?, answer_key = ?, answer_name = ?
     WHERE id = ?`
  ).bind(title, description || null, lastDate,
         answerDescription || null, newAnswerKey, newAnswerName, id).run();

  const updated = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.pdf_name, c.created_at,
            c.answer_description, c.answer_name,
            u.name AS posted_by_name
     FROM challenges c
     JOIN users u ON u.id = c.posted_by
     WHERE c.id = ?`
  ).bind(id).first();

  return json({ success: true, message: "Challenge updated", challenge: updated });
}
