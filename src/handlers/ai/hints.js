import { requireAuth } from "../../middleware/auth.js";
import { json } from "../../utils/response.js";
import { generateHintForLevel } from "../../services/aiAssist.js";
import { getHintCosts } from "../../utils/hintCosts.js";

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
    const hintCosts = await getHintCosts(env, { ensure: true });

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

    if (!hasRevealLevel && unlockedLevel < 0) unlockedLevel = 0;
    if (!hasRevealLevel && unlockedLevel > 4) unlockedLevel = 4;

    if (hasRevealLevel) {
      if (revealLevel !== unlockedLevel + 1) {
        return json({
          success: false,
          message: `Hint ${revealLevel} cannot be unlocked yet. Unlock Hint ${unlockedLevel + 1} first.`,
        }, 400);
      }

      const costForLevel = Number(hintCosts[revealLevel] || 0);

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

      const updateHintStmt = env.DB.prepare(
        `UPDATE user_challenge_hints
         SET ${hintColumn} = ?, unlocked_level = ?, updated_at = datetime('now')
         WHERE user_id = ? AND challenge_id = ?`
      ).bind(hintText, revealLevel, userId, challengeId);

      if (costForLevel > 0) {
        const reason = `AI Hint ${revealLevel} unlock (challenge #${challengeId})`;
        const deductStmt = env.DB.prepare(
          `INSERT INTO bonus_points (user_id, points, reason, granted_by)
           VALUES (?, ?, ?, ?)`
        ).bind(userId, -costForLevel, reason, userId);
        await env.DB.batch([updateHintStmt, deductStmt]);
      } else {
        await updateHintStmt.run();
      }

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

    const balance = await getUserNetBalance(env, userId);
    const latestUnlockCost = hasRevealLevel ? Number(hintCosts[revealLevel] || 0) : 0;
    return json({
      success: true,
      hints,
      unlockedLevel,
      hint_costs: hintCosts,
      balance,
      cost_applied: latestUnlockCost,
    });
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

async function getUserNetBalance(env, userId) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE((SELECT SUM(points) FROM submissions WHERE user_id = ?), 0)
      + COALESCE((SELECT SUM(points) FROM bonus_points WHERE user_id = ?), 0)
      - COALESCE((SELECT SUM(points_consumed) FROM user_rewards WHERE user_id = ?), 0)
      AS balance
  `).bind(userId, userId, userId).first();
  return Number(row?.balance || 0);
}
