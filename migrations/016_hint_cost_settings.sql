-- Dynamic AI hint pricing (Hint 1 is always free, levels 2-4 are configurable)
CREATE TABLE IF NOT EXISTS hint_cost_settings (
  level      INTEGER PRIMARY KEY CHECK(level BETWEEN 1 AND 4),
  cost       INTEGER NOT NULL CHECK(cost >= 0),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO hint_cost_settings (level, cost) VALUES
  (1, 0),
  (2, 5),
  (3, 10),
  (4, 15);
