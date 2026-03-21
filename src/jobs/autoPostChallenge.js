import { ADMIN_EMAIL } from "../config.js";
import { sendNewChallengeEmail } from "../utils/email.js";
import { generateChallengeFromClaude } from "../services/claudeChallenge.js";
import { buildChallengePdfBuffer } from "../utils/pdf.js";

function toDateOnly(isoLike) {
  return new Date(isoLike).toISOString().slice(0, 10);
}

function computeDeadline(daysAhead) {
  const now = Date.now();
  const target = new Date(now + daysAhead * 24 * 60 * 60 * 1000);
  return toDateOnly(target);
}

async function ensureAdminUser(env) {
  const existing = await env.DB.prepare(
    "SELECT id, name, role FROM users WHERE email = ? LIMIT 1"
  )
    .bind(ADMIN_EMAIL)
    .first();

  if (existing?.id) {
    if (existing.role !== "admin") {
      await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(existing.id).run();
    }
    return { id: existing.id, name: existing.name || "System Admin" };
  }

  try {
    const result = await env.DB.prepare(
      "INSERT INTO users (name, email, role, last_login) VALUES (?, ?, 'admin', datetime('now'))"
    )
      .bind("System Admin", ADMIN_EMAIL)
      .run();

    return { id: result.meta.last_row_id, name: "System Admin" };
  } catch {
    const user = await env.DB.prepare("SELECT id, name FROM users WHERE email = ? LIMIT 1")
      .bind(ADMIN_EMAIL)
      .first();

    if (!user?.id) throw new Error("Failed to ensure admin user for auto-post");
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
    return { id: user.id, name: user.name || "System Admin" };
  }
}

async function hasRecentAutoChallenge(env) {
  const recent = await env.DB.prepare(
    `SELECT id, title, created_at
     FROM challenges
     WHERE pdf_key LIKE 'challenges/ai-%'
       AND created_at >= datetime('now', '-25 minutes')
     ORDER BY id DESC
     LIMIT 1`
  )
    .first();

  return !!recent;
}

export async function runAutoPostChallenge(env, trigger = {}) {
  try {
    const force = !!trigger?.force;
    const enabled = (env.AI_AUTO_POST_ENABLED || "true").toLowerCase();
    if (!force && enabled === "false") {
      console.log("[auto-post] disabled via AI_AUTO_POST_ENABLED");
      return { ok: false, status: "disabled" };
    }

    if (!force && await hasRecentAutoChallenge(env)) {
      console.log("[auto-post] skipped: challenge already created in this window");
      return { ok: true, status: "skipped_recent" };
    }

    const admin = await ensureAdminUser(env);
    const generated = await generateChallengeFromClaude(env, {
      model: trigger?.preferences?.model,
      topic: trigger?.preferences?.topic,
      difficulty: trigger?.preferences?.difficulty,
      keyPoints: trigger?.preferences?.keyPoints,
      extraNotes: trigger?.preferences?.extraNotes,
    });

    const title = generated.title.slice(0, 120);
    const description = generated.description;
    const lastDate = computeDeadline(generated.deadlineDays || 3);

    const nowIso = new Date().toISOString();
    const pdfBuffer = buildChallengePdfBuffer({
      title,
      description,
      problemStatement: generated.problemStatement,
      generatedAtIso: nowIso,
    });

    const pdfKey = `challenges/ai-${Date.now()}-${crypto.randomUUID()}.pdf`;
    const pdfName = `${title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_") || "ai_challenge"}.pdf`;

    await env.R2.put(pdfKey, pdfBuffer, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: {
        originalName: pdfName,
        source: "ai-auto-post",
      },
    });

    const result = await env.DB.prepare(
      `INSERT INTO challenges (
        title,
        description,
        last_date,
        pdf_key,
        pdf_name,
        posted_by,
        answer_description,
        answer_key,
        answer_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
    )
      .bind(
        title,
        description,
        lastDate,
        pdfKey,
        pdfName,
        admin.id,
        generated.answerDescription
      )
      .run();

    const challengeId = result.meta.last_row_id;
    console.log("[auto-post] challenge created", {
      challengeId,
      cron: trigger?.cron,
      scheduledTime: trigger?.scheduledTime,
    });

    try {
      const { results: users } = await env.DB.prepare(
        "SELECT name, email FROM users WHERE role = 'user'"
      ).all();

      await Promise.allSettled(
        users.map((u) =>
          sendNewChallengeEmail({
            to: u.email,
            name: u.name,
            challengeTitle: title,
            description,
            deadline: lastDate,
          })
        )
      );
    } catch (mailErr) {
      console.error("[auto-post] notification emails failed", mailErr);
    }

    return { ok: true, status: "created", challengeId, title, lastDate };
  } catch (err) {
    console.error("[auto-post] failed", err);
    throw err;
  }
}
