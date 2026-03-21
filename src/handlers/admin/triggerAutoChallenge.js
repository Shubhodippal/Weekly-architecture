import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { json } from "../../utils/response.js";
import { runAutoPostChallenge } from "../../jobs/autoPostChallenge.js";

/**
 * POST /api/admin/challenges/auto-post
 * Admin only. Triggers immediate AI challenge generation.
 */
export async function handleTriggerAutoChallenge(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const adminError = requireAdmin(session);
  if (adminError) return adminError;

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
  const difficultyRaw = typeof payload.difficulty === "string" ? payload.difficulty.trim().toLowerCase() : "medium";
  const allowed = new Set(["easy", "medium", "hard"]);
  const difficulty = allowed.has(difficultyRaw) ? difficultyRaw : "medium";
  const keyPoints = Array.isArray(payload.keyPoints)
    ? payload.keyPoints.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const extraNotes = typeof payload.extraNotes === "string" ? payload.extraNotes.trim().slice(0, 500) : "";
  const allowedModels = new Set(["claude-opus-4-6", "gpt-5.4-2026-03-05"]);
  const model = typeof payload.model === "string" && allowedModels.has(payload.model.trim())
    ? payload.model.trim()
    : "claude-opus-4-6";

  if (!topic) {
    return json({ success: false, message: "Topic is required" }, 400);
  }

  if (model.startsWith("gpt-") && !env.OPENAI_API_KEY) {
    return json({ success: false, message: "OPENAI_API_KEY is not configured on server" }, 400);
  }
  if (!model.startsWith("gpt-") && !env.ANTHROPIC_API_KEY) {
    return json({ success: false, message: "ANTHROPIC_API_KEY is not configured on server" }, 400);
  }

  let result;
  try {
    result = await runAutoPostChallenge(env, {
      source: "manual-admin",
      force: true,
      requestedBy: session.userId,
      preferences: {
        model,
        topic,
        difficulty,
        keyPoints,
        extraNotes,
      },
    });
  } catch (err) {
    console.error("[triggerAutoChallenge] failed", err);
    const message =
      (err && typeof err.message === "string" && err.message.trim())
        ? err.message.slice(0, 500)
        : "Failed to trigger AI challenge";
    return json({ success: false, message }, 500);
  }

  return json(
    {
      success: true,
      message: "AI challenge trigger executed",
      result,
    },
    200
  );
}
