import { getDb } from '../db/connection.js'

export type StaticPluginId = 'omos.summary' | 'omos.relevance' | 'omos.topics'
const TABLES: Record<StaticPluginId, string> = { 'omos.summary': 'summary_jobs', 'omos.relevance': 'relevance_jobs', 'omos.topics': 'topics_jobs' }

export function isStaticPluginEnabled(pluginId: StaticPluginId): boolean {
  return (getDb().prepare('SELECT enabled FROM static_plugin_config WHERE plugin_id = ?').get(pluginId) as { enabled: number }).enabled === 1
}
export function setStaticPluginEnabled(pluginId: StaticPluginId, enabled: boolean): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare("UPDATE static_plugin_config SET enabled = ?, updated_at = datetime('now') WHERE plugin_id = ?").run(enabled ? 1 : 0, pluginId)
    if (!enabled) db.prepare(`DELETE FROM ${TABLES[pluginId]} WHERE status IN ('pending', 'failed')`).run()
  })()
}
export function getStaticPluginHealth(pluginId: StaticPluginId) {
  const table = TABLES[pluginId]
  const row = getDb().prepare(`SELECT
    SUM(status = 'pending') AS pending, SUM(status = 'running') AS running, SUM(status = 'failed') AS failed,
    SUM(status = 'dead') AS dead, SUM(status = 'succeeded') AS succeeded, SUM(status = 'superseded') AS superseded
    FROM ${table}`).get() as Record<string, number | null>
  return { plugin_id: pluginId, enabled: isStaticPluginEnabled(pluginId), pending: row.pending ?? 0, running: row.running ?? 0, failed: row.failed ?? 0, dead: row.dead ?? 0, succeeded: row.succeeded ?? 0, superseded: row.superseded ?? 0 }
}
