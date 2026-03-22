export const HINT_LEVELS = [1, 2, 3, 4];

export const DEFAULT_HINT_COSTS = {
  1: 0,
  2: 5,
  3: 10,
  4: 15,
};

export async function ensureHintCostTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS hint_cost_settings (
      level      INTEGER PRIMARY KEY CHECK(level BETWEEN 1 AND 4),
      cost       INTEGER NOT NULL CHECK(cost >= 0),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_by INTEGER REFERENCES users(id)
    )
  `).run();

  const ops = HINT_LEVELS.map((level) =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO hint_cost_settings (level, cost, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(level, DEFAULT_HINT_COSTS[level])
  );
  await env.DB.batch(ops);
}

export async function getHintCosts(env, { ensure = false } = {}) {
  const costs = { ...DEFAULT_HINT_COSTS };
  try {
    if (ensure) await ensureHintCostTable(env);
    const rows = await env.DB.prepare(
      "SELECT level, cost FROM hint_cost_settings WHERE level BETWEEN 1 AND 4 ORDER BY level ASC"
    ).all();
    for (const row of rows.results || []) {
      const level = parseInt(row.level, 10);
      if (!HINT_LEVELS.includes(level)) continue;
      const cost = parseInt(row.cost, 10);
      if (!Number.isNaN(cost) && cost >= 0) costs[level] = cost;
    }
  } catch (err) {
    const msg = String(err?.message || "");
    if (!msg.includes("no such table")) {
      console.error("[hintCosts] failed to load:", err);
    }
  }

  // Business rule: Hint 1 is always free.
  costs[1] = 0;
  return costs;
}
