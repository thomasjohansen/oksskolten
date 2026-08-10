CREATE TABLE IF NOT EXISTS reprocess_runs (
  run_id TEXT PRIMARY KEY,
  modules_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS reprocess_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES reprocess_runs(run_id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('summary', 'relevance', 'ai_labels')),
  job_id INTEGER,
  UNIQUE (run_id, article_id, module)
);

CREATE INDEX IF NOT EXISTS idx_reprocess_run_items_run ON reprocess_run_items(run_id, module);
CREATE INDEX IF NOT EXISTS idx_reprocess_run_items_job ON reprocess_run_items(module, job_id);
