import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { sendNewChallengeEmail } from "../../utils/email.js";

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

  const title              = (formData.get("title") || "").trim();
  const description        = (formData.get("description") || "").trim();
  const lastDate           = (formData.get("last_date") || "").trim();
  const publishAtRaw       = (formData.get("publish_at") || "").trim();
  const answerDescription  = (formData.get("answer_description") || "").trim();
  const pdfFile            = formData.get("pdf");
  const answerPdfFile      = formData.get("answer_pdf");

  // Validate required fields
  if (!title) {
    return json({ success: false, message: "Title is required" }, 400);
  }
  if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    return json({ success: false, message: "last_date must be in YYYY-MM-DD format" }, 400);
  }

  const publishAt = normalizePublishAt(publishAtRaw);
  if (publishAtRaw && !publishAt) {
    return json({ success: false, message: "publish_at must be a valid datetime" }, 400);
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

  // Validate optional answer PDF
  if (answerPdfFile && typeof answerPdfFile !== "string") {
    if (answerPdfFile.type && answerPdfFile.type !== "application/pdf") {
      return json({ success: false, message: "Answer file must be a PDF" }, 400);
    }
    if (answerPdfFile.size > MAX_BYTES) {
      return json({ success: false, message: "Answer PDF must be smaller than 20 MB" }, 400);
    }
  }

  // Upload challenge PDF to R2
  const pdfKey  = `challenges/${crypto.randomUUID()}.pdf`;
  const pdfName = pdfFile.name || "challenge.pdf";
  const arrayBuf = await pdfFile.arrayBuffer();
  await env.R2.put(pdfKey, arrayBuf, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { originalName: pdfName },
  });

  // Upload optional answer PDF to R2
  let answerKey  = null;
  let answerName = null;
  if (answerPdfFile && typeof answerPdfFile !== "string" && answerPdfFile.size > 0) {
    answerKey  = `answers/${crypto.randomUUID()}.pdf`;
    answerName = answerPdfFile.name || "answer.pdf";
    const answerBuf = await answerPdfFile.arrayBuffer();
    await env.R2.put(answerKey, answerBuf, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { originalName: answerName },
    });
  }

  // Persist metadata to D1
  const result = await env.DB.prepare(
    `INSERT INTO challenges (title, description, last_date, pdf_key, pdf_name, posted_by,
                             answer_description, answer_key, answer_name, publish_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(title, description || null, lastDate, pdfKey, pdfName, session.userId,
          answerDescription || null, answerKey, answerName, publishAt)
    .run();

  const challenge = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.pdf_name, c.created_at, c.publish_at,
            u.name AS posted_by_name
     FROM challenges c
     JOIN users u ON u.id = c.posted_by
     WHERE c.id = ?`
  )
    .bind(result.meta.last_row_id)
    .first();

  // Notify all non-admin users via email (non-blocking)
  try {
    const { results: users } = await env.DB.prepare(
      "SELECT name, email FROM users WHERE role = 'user'"
    ).all();
    await Promise.allSettled(
      users.map((u) =>
        sendNewChallengeEmail({
          to:             u.email,
          name:           u.name,
          challengeTitle: challenge.title,
          description:    challenge.description,
          deadline:       challenge.last_date,
        })
      )
    );
  } catch (e) {
    console.error("[postChallenge] notification emails failed:", e);
  }

  return json({ success: true, message: "Challenge posted successfully", challenge }, 201);
}

function normalizePublishAt(raw) {
  if (!raw) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 19).replace("T", " ");
}
