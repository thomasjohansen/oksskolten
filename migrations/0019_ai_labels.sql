ALTER TABLE labels ADD COLUMN origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'ai'));
ALTER TABLE labels ADD COLUMN normalized_name TEXT;
UPDATE labels SET normalized_name = lower(trim(name)) WHERE normalized_name IS NULL;
CREATE INDEX IF NOT EXISTS idx_labels_normalized_name ON labels(normalized_name) WHERE normalized_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS article_ai_labels (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_content_hash TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT 'omos.ai-labels',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (article_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_article_ai_labels_label ON article_ai_labels(label_id);

CREATE TABLE IF NOT EXISTS ai_label_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead', 'superseded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE (article_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_ai_label_jobs_claim ON ai_label_jobs(available_at, id) WHERE status IN ('pending', 'failed');

ALTER TABLE static_plugin_config ADD COLUMN allow_new_labels INTEGER NOT NULL DEFAULT 1 CHECK (allow_new_labels IN (0, 1));
INSERT OR IGNORE INTO static_plugin_config (plugin_id, enabled, allow_new_labels) VALUES ('omos.ai-labels', 1, 1);
UPDATE static_plugin_config SET enabled = (SELECT enabled FROM static_plugin_config WHERE plugin_id = 'omos.topics') WHERE plugin_id = 'omos.ai-labels';

CREATE VIEW IF NOT EXISTS effective_article_labels AS
  SELECT article_id, label_id FROM article_labels
  UNION
  SELECT article_id, label_id FROM article_ai_labels;
