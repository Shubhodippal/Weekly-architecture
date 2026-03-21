import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { generateSubmissionFeedback } from "../../services/aiAssist.js";

/**
 * POST /api/challenges/:id/submit
 * Multipart form: solution_text (string), file? (PDF/image, optional)
 * Creates or fully replaces the calling user's submission for this challenge.
 * Only allowed while the challenge is still active (deadline not passed).
 */
export async function handleSubmit(request, env, challengeId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid ID" }, 400);

  // Check challenge exists and is still active
  const challenge = await env.DB.prepare(
    "SELECT id, title, description, last_date, answer_description FROM challenges WHERE id = ?"
  ).bind(id).first();

  if (!challenge) return json({ success: false, message: "Challenge not found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  if (challenge.last_date < today)
    return json({ success: false, message: "Challenge deadline has passed. Submissions are closed." }, 403);

  // Parse multipart
  let formData;
  try { formData = await request.formData(); }
  catch { return json({ success: false, message: "Expected multipart/form-data" }, 400); }

  const solutionText = (formData.get("solution_text") || "").trim();
  const attachment   = formData.get("file");
  const removeFile   = formData.get("remove_file") === "1";
  const hasFile      = attachment && typeof attachment !== "string" && attachment.size > 0;

  if (!solutionText && !hasFile)
    return json({ success: false, message: "Provide a solution text or attach a file." }, 400);

  // Validate file if present
  if (hasFile) {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg",
                     "image/gif", "image/webp", "image/svg+xml"];
    if (attachment.type && !allowed.includes(attachment.type))
      return json({ success: false, message: "Only PDF or image files are accepted." }, 400);
    if (attachment.size > 20 * 1024 * 1024)
      return json({ success: false, message: "File must be smaller than 20 MB." }, 400);
  }

  // If there's an existing submission, grab old file key so we can delete it from R2
  const existing = await env.DB.prepare(
    "SELECT id, file_key FROM submissions WHERE challenge_id = ? AND user_id = ?"
  ).bind(id, session.userId).first();

  let fileKey  = existing?.file_key  || null;
  let fileName = existing?.file_name || null;
  let fileType = existing?.file_type || null;

  if (hasFile) {
    // Delete old file from R2 if replacing
    if (existing?.file_key) {
      await env.R2.delete(existing.file_key).catch(() => null);
    }
    fileKey  = `submissions/${id}/${session.userId}/${crypto.randomUUID()}${getExt(attachment.name)}`;
    fileName = attachment.name || "attachment";
    fileType = attachment.type || "application/octet-stream";
    await env.R2.put(fileKey, await attachment.arrayBuffer(), {
      httpMetadata: { contentType: fileType },
      customMetadata: { originalName: fileName },
    });
  } else if (removeFile && existing?.file_key) {
    // User explicitly removed the existing file without uploading a new one
    await env.R2.delete(existing.file_key).catch(() => null);
    fileKey  = null;
    fileName = null;
    fileType = null;
  }

  const now = new Date().toISOString();

  if (existing) {
    await env.DB.prepare(
      `UPDATE submissions
       SET solution_text = ?, file_key = ?, file_name = ?, file_type = ?, updated_at = ?
       WHERE id = ?`
    ).bind(solutionText || null, fileKey, fileName, fileType, now, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO submissions (challenge_id, user_id, solution_text, file_key, file_name, file_type, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, session.userId, solutionText || null, fileKey, fileName, fileType, now, now).run();
  }

  let feedback = null;
  try {
    if (solutionText) {
      feedback = await generateSubmissionFeedback(env, {
        challenge,
        solutionText,
      });
    }
  } catch (e) {
    console.error("[submit] AI feedback failed:", e);
  }

  return json({
    success: true,
    message: existing ? "Submission updated." : "Solution submitted!",
    feedback: feedback || undefined,
  });
}

function getExt(filename) {
  if (!filename) return "";
  const m = filename.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0] : "";
}
