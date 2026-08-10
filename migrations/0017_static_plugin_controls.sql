CREATE TABLE IF NOT EXISTS static_plugin_config (
  plugin_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO static_plugin_config (plugin_id, enabled) VALUES ('omos.summary', 1), ('omos.relevance', 1), ('omos.topics', 1);

ALTER TABLE relevance_config ADD COLUMN profile_json TEXT;
ALTER TABLE relevance_config ADD COLUMN profile_configured INTEGER NOT NULL DEFAULT 0;
UPDATE relevance_config SET profile_json = '{"version":1,"name":"Balanced","weights":{"evidence_credibility":0.2,"public_significance":0.2,"information_value":0.2,"constructive_positive_impact":0.15,"clickbait_penalty":0.1,"paywall_penalty":0.075,"distressing_conflict_war_penalty":0.075}}' WHERE profile_json IS NULL;
ALTER TABLE article_relevance ADD COLUMN signals_json TEXT;
ALTER TABLE article_relevance ADD COLUMN profile_hash TEXT;
