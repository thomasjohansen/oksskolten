CREATE TABLE IF NOT EXISTS relevance_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  brief TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO relevance_config (id, brief, revision) VALUES (1, NULL, 0);

CREATE TABLE IF NOT EXISTS relevance_brief_revisions (
  revision INTEGER PRIMARY KEY,
  brief TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relevance_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  brief_hash TEXT NOT NULL,
  brief_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead', 'superseded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE (article_id, content_hash, brief_hash, brief_revision)
);
CREATE INDEX IF NOT EXISTS idx_relevance_jobs_claim ON relevance_jobs(available_at, id) WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS article_relevance (
  article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  reason TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  brief_hash TEXT NOT NULL,
  brief_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
