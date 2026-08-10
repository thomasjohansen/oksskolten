-- Extend the lifecycle CHECK without dropping label data or relationships.
DROP VIEW IF EXISTS effective_article_labels;

CREATE TABLE labels_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  match_text TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'both' CHECK (match_field IN ('title', 'full_text', 'both')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  auto_summarize INTEGER NOT NULL DEFAULT 0 CHECK (auto_summarize IN (0, 1)),
  exclusive INTEGER NOT NULL DEFAULT 0 CHECK (exclusive IN (0, 1)),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'ai')),
  normalized_name TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'promoted' CHECK (lifecycle_status IN ('candidate', 'promoted', 'dismissed'))
);

INSERT INTO labels_new (id, name, match_text, match_field, sort_order, created_at, auto_summarize, exclusive, origin, normalized_name, lifecycle_status)
SELECT id, name, match_text, match_field, sort_order, created_at, auto_summarize, exclusive, origin, normalized_name, lifecycle_status
FROM labels;
DROP TABLE labels;
ALTER TABLE labels_new RENAME TO labels;

CREATE INDEX IF NOT EXISTS idx_labels_normalized_name ON labels(normalized_name) WHERE normalized_name IS NOT NULL;
CREATE VIEW effective_article_labels AS
  SELECT article_id, label_id FROM article_labels
  UNION
  SELECT article_id, label_id FROM article_ai_labels;
