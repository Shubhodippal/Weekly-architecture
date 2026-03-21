-- Migration: add pinned flag to comments and reactions table
ALTER TABLE challenge_comments ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id  INTEGER NOT NULL REFERENCES challenge_comments(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction    TEXT    NOT NULL CHECK(reaction IN ('like', 'dislike')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
  ON comment_reactions (comment_id);
