import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/submissions/:submissionId/file
 * Streams the file attached to a submission from R2.
 * Allowed if requester is the owner OR an admin.
 */
export async function handleDownloadSubmissionFile(request, env, submissionId) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const id = parseInt(submissionId, 10);
  if (!id || isNaN(id)) return json({ success: false, message: "Invalid ID" }, 400);

  const submission = await env.DB.prepare(
    `SELECT user_id, file_key, file_name, file_type FROM submissions WHERE id = ?`
  ).bind(id).first();

  if (!submission) return json({ success: false, message: "Submission not found." }, 404);
  if (!submission.file_key) return json({ success: false, message: "No file attached." }, 404);

  const isAdmin = session.role === "admin";
  if (submission.user_id !== session.userId && !isAdmin) {
    return json({ success: false, message: "Forbidden." }, 403);
  }

  const obj = await env.R2.get(submission.file_key);
  if (!obj) return json({ success: false, message: "File not found in storage." }, 404);

  const headers = new Headers();
  headers.set("Content-Type", submission.file_type || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(submission.file_name || "file")}"`
  );
  if (obj.size) headers.set("Content-Length", String(obj.size));

  return new Response(obj.body, { status: 200, headers });
}
