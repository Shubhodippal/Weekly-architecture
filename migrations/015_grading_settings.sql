-- Admin-configurable points per grading outcome
CREATE TABLE IF NOT EXISTS grading_settings (
  grade      TEXT PRIMARY KEY CHECK(grade IN ('wrong', 'partial', 'almost', 'correct')),
  points     INTEGER NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO grading_settings (grade, points) VALUES
  ('wrong', 0),
  ('partial', 5),
  ('almost', 15),
  ('correct', 20);
