CREATE TABLE IF NOT EXISTS topics_jobs (
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
CREATE INDEX IF NOT EXISTS idx_topics_jobs_claim ON topics_jobs(available_at, id) WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS article_topics (
  article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  topics_json TEXT NOT NULL,
  source_content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
