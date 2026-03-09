import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/challenges/:id/download
 * Streams the PDF from R2 to the client with proper content-disposition.
 * Any authenticated user can download.
 */
export async function handleDownloadChallenge(request, env, challengeId) {
  const { error } = await requireAuth(request, env);
  if (error) return error;

  const id = parseInt(challengeId, 10);
  if (!id || isNaN(id)) {
    return json({ success: false, message: "Invalid challenge ID" }, 400);
  }

  const challenge = await env.DB.prepare(
    "SELECT pdf_key, pdf_name FROM challenges WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!challenge) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  const object = await env.R2.get(challenge.pdf_key);
  if (!object) {
    return json({ success: false, message: "PDF file not found in storage" }, 404);
  }

  // Sanitise filename for content-disposition header
  const safeName = challenge.pdf_name.replace(/[^\w\s.\-]/g, "_");
  const inline   = new URL(request.url).searchParams.get("inline") === "1";

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
