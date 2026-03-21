import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { generateHintForLevel } from "../../services/aiAssist.js";

function isWeakStoredHint(text, challengeDesc = "") {
  const t = String(text || "").trim();
  if (!t || t.length < 40 || t.length > 800) return true;

  const low = t.toLowerCase();
  const weakPatterns = [
    "use one small concrete example from",
    "turn your traced example for",
    "for in modern messaging applications",
  ];
  if (weakPatterns.some((p) => low.includes(p))) return true;

  const desc = String(challengeDesc || "").trim().toLowerCase();
  if (desc && low.includes(desc.slice(0, 220))) return true;

  return false;
}

/**
 * POST /api/ai/hints
 * Body: { challengeId: number, revealLevel?: 1|2|3|4 }
 * Returns persisted hint state; each hint is generated only when that level is revealed.
 */
export async function handleHints(request, env) {
  const { session, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const challengeId = Number.parseInt(body.challengeId, 10);
  if (!challengeId || Number.isNaN(challengeId)) {
    return json({ success: false, message: "challengeId is required" }, 400);
  }

  const revealLevelRaw = body?.revealLevel;
  const hasRevealLevel = revealLevelRaw !== undefined && revealLevelRaw !== null;
  const revealLevel = hasRevealLevel ? Number.parseInt(revealLevelRaw, 10) : null;
  if (hasRevealLevel && (![1, 2, 3, 4].includes(revealLevel))) {
    return json({ success: false, message: "revealLevel must be 1, 2, 3, or 4" }, 400);
  }

  const challenge = await env.DB.prepare(
    "SELECT id, title, description, answer_description FROM challenges WHERE id = ?"
  ).bind(challengeId).first();

  if (!challenge) {
    return json({ success: false, message: "Challenge not found" }, 404);
  }

  try {
    const userId = session.userId;

    let row = await env.DB.prepare(
      `SELECT hint_1, hint_2, hint_3, hint_4, unlocked_level
       FROM user_challenge_hints
       WHERE user_id = ? AND challenge_id = ?`
    ).bind(userId, challengeId).first();

    if (!row) {
      await env.DB.prepare(
        `INSERT INTO user_challenge_hints
         (user_id, challenge_id, hint_1, hint_2, hint_3, hint_4, unlocked_level)
         VALUES (?, ?, ?, ?, ?, ?, 0)`
      ).bind(userId, challengeId, "", "", "", "").run();

      row = {
        hint_1: "",
        hint_2: "",
        hint_3: "",
        hint_4: "",
        unlocked_level: 0,
      };
    }

    let unlockedLevel = Number(row.unlocked_level) || 0;

    if (!hasRevealLevel && unlockedLevel > 0) {
      const persisted = [
        String(row.hint_1 || "").trim(),
        String(row.hint_2 || "").trim(),
        String(row.hint_3 || "").trim(),
        String(row.hint_4 || "").trim(),
      ];

      for (let level = 1; level <= unlockedLevel; level += 1) {
        if (!isWeakStoredHint(persisted[level - 1], challenge.description || "")) continue;

        try {
          const regenerated = await generateHintForLevel(env, {
            challenge,
            level,
            previousHints: persisted.slice(0, level - 1).filter(Boolean),
          });
          const repairedText = String(regenerated?.text || "").trim();
          if (!repairedText) continue;

          persisted[level - 1] = repairedText;
          const hintColumn = `hint_${level}`;
          await env.DB.prepare(
            `UPDATE user_challenge_hints
             SET ${hintColumn} = ?, updated_at = datetime('now')
             WHERE user_id = ? AND challenge_id = ?`
          ).bind(repairedText, userId, challengeId).run();
        } catch (repairErr) {
          console.warn(`[ai/hints] weak hint repair failed for level ${level}`, repairErr);
        }
      }

      row = {
        ...row,
        hint_1: persisted[0] || "",
        hint_2: persisted[1] || "",
        hint_3: persisted[2] || "",
        hint_4: persisted[3] || "",
      };
    }

    if (hasRevealLevel) {
      if (revealLevel !== unlockedLevel + 1) {
        return json({
          success: false,
          message: `Hint ${revealLevel} cannot be unlocked yet. Unlock Hint ${unlockedLevel + 1} first.`,
        }, 400);
      }

      const existingHints = [
        String(row.hint_1 || ""),
        String(row.hint_2 || ""),
        String(row.hint_3 || ""),
        String(row.hint_4 || ""),
      ];
      const hintColumn = `hint_${revealLevel}`;
      let hintText = String(existingHints[revealLevel - 1] || "").trim();

      if (!hintText) {
        const generated = await generateHintForLevel(env, {
          challenge,
          level: revealLevel,
          previousHints: existingHints.slice(0, revealLevel - 1).filter(Boolean),
        });
        hintText = String(generated?.text || "").trim();

        if (!hintText) {
          throw new Error(`AI hint generation failed for level ${revealLevel}`);
        }
      }

      await env.DB.prepare(
        `UPDATE user_challenge_hints
         SET ${hintColumn} = ?, unlocked_level = ?, updated_at = datetime('now')
         WHERE user_id = ? AND challenge_id = ?`
      ).bind(hintText, revealLevel, userId, challengeId).run();

      unlockedLevel = revealLevel;

      row = {
        ...row,
        [hintColumn]: hintText,
        unlocked_level: unlockedLevel,
      };
    }

    const hints = [
      { level: 1, text: String(row.hint_1 || "") },
      { level: 2, text: String(row.hint_2 || "") },
      { level: 3, text: String(row.hint_3 || "") },
      { level: 4, text: String(row.hint_4 || "") },
    ];

    return json({ success: true, hints, unlockedLevel });
  } catch (e) {
    console.error("[ai/hints]", e);
    const message = (e && e.message) ? e.message : "AI hints failed with an unknown error";
    return json({
      success: false,
      message,
      error: {
        name: e?.name || "Error",
        message,
        stack: String(e?.stack || "").split("\n").slice(0, 6).join("\n"),
      },
    }, 500);
  }
}
