import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";

/**
 * GET /api/ai/recommendations
 * Returns a small list of recommended challenges for the current user
 * with short human-readable reasons. Uses simple heuristics (no LLM).
 */
export async function handleRecommendations(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  const userId = session.userId;

  // Fetch active & published challenges
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const { results: challenges } = await env.DB.prepare(
    `SELECT c.id, c.title, c.description, c.last_date, c.publish_at
       FROM challenges c`
  ).all();

  // Fetch user's submissions (latest per challenge)
  const { results: subs } = await env.DB.prepare(
    `SELECT s.challenge_id, s.grade, s.submitted_at
       FROM submissions s
      WHERE s.user_id = ?`
  ).bind(userId).all();

  const byChallenge = new Map();
  for (const row of subs) {
    const key = row.challenge_id;
    const existing = byChallenge.get(key);
    if (!existing || (row.submitted_at && row.submitted_at > existing.submitted_at)) {
      byChallenge.set(key, row);
    }
  }

  const activePublished = challenges.filter((c) => {
    if (!c.last_date || c.last_date < today) return false;
    if (!c.publish_at) return true;
    const publishAtDate = new Date(String(c.publish_at).replace(" ", "T") + "Z");
    return publishAtDate.getTime() <= now.getTime();
  });

  const unattempted = [];
  const needsReview = [];

  for (const c of activePublished) {
    const s = byChallenge.get(c.id);
    if (!s) {
      unattempted.push(c);
    } else if (s.grade === "wrong" || s.grade === "partial") {
      needsReview.push({ challenge: c, submission: s });
    }
  }

  // Sort unattempted by nearest deadline
  unattempted.sort((a, b) => (a.last_date || "").localeCompare(b.last_date || ""));

  const recommendations = [];

  for (const c of unattempted.slice(0, 3)) {
    const daysLeft = (() => {
      try {
        const due = new Date(c.last_date);
        const diff = Math.ceil((due.getTime() - now.getTime()) / 86400000);
        if (diff <= 0) return "due very soon";
        if (diff === 1) return "due tomorrow";
        return `due in ${diff} days`;
      } catch {
        return "with an upcoming deadline";
      }
    })();

    recommendations.push({
      challengeId: c.id,
      title: c.title,
      last_date: c.last_date,
      reason: `You haven't attempted this challenge yet and it's ${daysLeft}. Tackling it now will help you keep your streak going.`,
    });
  }

  for (const { challenge: c, submission: s } of needsReview.slice(0, 2)) {
    const label = s.grade === "partial" ? "partially correct" : "marked as incorrect";
    recommendations.push({
      challengeId: c.id,
      title: c.title,
      last_date: c.last_date,
      reason: `You submitted this earlier and it was ${label}. Revisiting it with what you've learned since can be a powerful way to improve.`,
    });
  }

  return json({ success: true, recommendations });
}
