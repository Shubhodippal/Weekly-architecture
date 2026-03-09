import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";

/**
 * POST /api/challenges
 * Content-Type: multipart/form-data
 * Fields: title, description (optional), last_date (YYYY-MM-DD), pdf (file)
 * Admin only.
 */
export async function handlePostChallenge(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  // Parse multipart form
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, message: "Expected multipart/form-data" }, 400);
  }

  const title       = (formData.get("title") || "").trim();
  const description = (formData.get("description") || "").trim();
  const lastDate    = (formData.get("last_date") || "").trim();
  const pdfFile     = formData.get("pdf");

  // Validate required fields
  if (!title) {
    return json({ success: false, message: "Title is required" }, 400);
  }
  if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    return json({ success: false, message: "last_date must be in YYYY-MM-DD format" }, 400);
  }
  if (!pdfFile || typeof pdfFile === "string") {
    return json({ success: false, message: "A PDF file is required" }, 400);
  }
  if (pdfFile.type && pdfFile.type !== "application/pdf") {
    return json({ success: false, message: "Only PDF files are accepted" }, 400);
  }
  // 20 MB limit
  const MAX_BYTES = 20 * 1024 * 1024;
  if (pdfFile.size > MAX_BYTES) {
    return json({ success: false, message: "PDF must be smaller than 20 MB" }, 400);
  }

  // Generate a unique R2 key
  const pdfKey  = `challenges/${crypto.randomUUID()}.pdf`;
  const pdfName = pdfFile.name || "challenge.pdf";

  // Upload to R2
  const arrayBuf = await pdfFile.arrayBuffer();
  await env.R2.put(pdfKey, arrayBuf, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { originalName: pdfName },
  });

  // Persist metadata to D1
  const result = await env.DB.prepare(
    `INSERT INTO challenges (title, description, last_date, pdf_key, pdf_name, posted_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(title, description || null, lastDate, pdfKey, pdfName, session.userId)
    .run();

  const challenge = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.pdf_name, c.created_at,
            u.name AS posted_by_name
     FROM challenges c
     JOIN users u ON u.id = c.posted_by
     WHERE c.id = ?`
  )
    .bind(result.meta.last_row_id)
    .first();

  return json({ success: true, message: "Challenge posted successfully", challenge }, 201);
}
