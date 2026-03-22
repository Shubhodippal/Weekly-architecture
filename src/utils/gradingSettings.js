export const GRADE_KEYS = ["wrong", "partial", "almost", "correct"];

export const GRADE_LABELS = {
  wrong: "Wrong",
  partial: "Partially Correct",
  almost: "Almost Correct",
  correct: "Correct",
};

export const DEFAULT_GRADE_POINTS = {
  wrong: 0,
  partial: 5,
  almost: 15,
  correct: 20,
};

export async function ensureGradingSettingsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS grading_settings (
      grade      TEXT PRIMARY KEY CHECK(grade IN ('wrong', 'partial', 'almost', 'correct')),
      points     INTEGER NOT NULL,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id)
    )
  `).run();

  const ops = GRADE_KEYS.map((grade) =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO grading_settings (grade, points, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(grade, DEFAULT_GRADE_POINTS[grade])
  );
  await env.DB.batch(ops);
}

export async function getGradingPoints(env, { ensure = false } = {}) {
  const points = { ...DEFAULT_GRADE_POINTS };
  try {
    if (ensure) await ensureGradingSettingsTable(env);
    const rows = await env.DB.prepare(
      "SELECT grade, points FROM grading_settings WHERE grade IN ('wrong','partial','almost','correct')"
    ).all();

    for (const row of rows.results || []) {
      const grade = String(row.grade || "").trim();
      if (!Object.prototype.hasOwnProperty.call(points, grade)) continue;
      const val = parseInt(row.points, 10);
      if (!Number.isNaN(val)) points[grade] = val;
    }
  } catch (err) {
    const msg = String(err?.message || "");
    if (!msg.includes("no such table")) {
      console.error("[gradingSettings] failed to load:", err);
    }
  }

  return points;
}
