import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges/:id/answer
 * Streams the answer PDF from R2. Only available after the challenge has expired.
 * Any authenticated user can access once expired.
 */
export async function handleDownloadAnswer(request, env, challengeId) {
  const { error } = await requireAuth(request, env);
  if (error) return error;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) {
    return json({ success: false, message: "Invalid challenge ID" }, 400);
  }

  const challenge = await env.DB.prepare(
    "SELECT answer_key, answer_name, last_date FROM challenges WHERE id = ?"
  ).bind(id).first();

  if (!challenge) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  // Only reveal the answer once the challenge is expired
  const now = new Date().toISOString().slice(0, 10);
  if (challenge.last_date >= now) {
    return json({ success: false, message: "Answer is not available until the challenge closes" }, 403);
  }

  if (!challenge.answer_key) {
    return json({ success: false, message: "No answer file has been uploaded for this challenge" }, 404);
  }

  const object = await env.R2.get(challenge.answer_key);
  if (!object) {
    return json({ success: false, message: "Answer file not found in storage" }, 404);
  }

  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${challenge.answer_name}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
