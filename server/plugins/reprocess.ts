import { randomUUID } from 'node:crypto'
import { getDb } from '../db/connection.js'
import { enqueueSummaryForArticle } from './summary.js'
import { enqueueRelevanceForArticle } from './relevance.js'
import { enqueueAiLabelsForArticle } from './ai-labels.js'

export const REPROCESS_MAX_LIMIT = 50
export const REPROCESS_MODULES = ['summary', 'relevance', 'ai_labels'] as const
export type ReprocessModule = typeof REPROCESS_MODULES[number]
type ItemState = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
type Counters = Record<ItemState, number> & { total: number }
export interface ReprocessRun {
  run_id: string
  status: 'running' | 'succeeded' | 'failed'
  modules: Record<ReprocessModule, Counters>
}

function emptyCounters(): Counters { return { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, skipped: 0 } }
function jobState(module: ReprocessModule, jobId: number | null): ItemState {
  if (jobId === null) return 'skipped'
  const table = module === 'summary' ? 'summary_jobs' : module === 'relevance' ? 'relevance_jobs' : 'ai_label_jobs'
  const row = getDb().prepare(`SELECT status FROM ${table} WHERE id = ?`).get(jobId) as { status: string } | undefined
  if (!row || row.status === 'superseded') return 'skipped'
  if (row.status === 'dead' || row.status === 'failed') return 'failed'
  if (row.status === 'pending' || row.status === 'running' || row.status === 'succeeded') return row.status
  return 'skipped'
}

export function reprocessArticles(options: { modules: ReprocessModule[]; limit?: number }): { run_id: string } {
  const modules = [...new Set(options.modules)]
  const limit = Math.max(1, Math.min(REPROCESS_MAX_LIMIT, Math.floor(options.limit ?? REPROCESS_MAX_LIMIT)))
  const db = getDb(); const runId = randomUUID()
  const articles = db.prepare(`SELECT id FROM articles WHERE full_text IS NOT NULL AND length(trim(full_text)) > 0
    ORDER BY (seen_at IS NULL) DESC, COALESCE(fetched_at, created_at) DESC, id DESC LIMIT ?`).all(limit) as Array<{ id: number }>
  db.transaction(() => {
    db.prepare('INSERT INTO reprocess_runs (run_id, modules_json) VALUES (?, ?)').run(runId, JSON.stringify(modules))
    const insert = db.prepare('INSERT INTO reprocess_run_items (run_id, article_id, module, job_id) VALUES (?, ?, ?, ?)')
    for (const article of articles) for (const module of modules) {
      const jobId = module === 'summary' ? enqueueSummaryForArticle(article.id) : module === 'relevance' ? enqueueRelevanceForArticle(article.id) : enqueueAiLabelsForArticle(article.id)
      insert.run(runId, article.id, module, jobId)
    }
  })()
  return { run_id: runId }
}

export function getReprocessRun(runId: string): ReprocessRun | null {
  const db = getDb()
  const run = db.prepare('SELECT run_id, status, modules_json FROM reprocess_runs WHERE run_id = ?').get(runId) as { run_id: string; status: ReprocessRun['status']; modules_json: string } | undefined
  if (!run) return null
  const modules = JSON.parse(run.modules_json) as ReprocessModule[]
  const counters = Object.fromEntries(modules.map(module => [module, emptyCounters()])) as Record<ReprocessModule, Counters>
  const items = db.prepare('SELECT module, job_id FROM reprocess_run_items WHERE run_id = ?').all(runId) as Array<{ module: ReprocessModule; job_id: number | null }>
  for (const item of items) { const state = jobState(item.module, item.job_id); counters[item.module].total++; counters[item.module][state]++ }
  const active = modules.some(module => counters[module].pending > 0 || counters[module].running > 0)
  const failed = modules.some(module => counters[module].failed > 0)
  const status: ReprocessRun['status'] = active ? 'running' : failed ? 'failed' : 'succeeded'
  if (status !== run.status) db.prepare("UPDATE reprocess_runs SET status = ?, updated_at = datetime('now'), completed_at = CASE WHEN ? != 'running' THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END WHERE run_id = ?").run(status, status, runId)
  return { run_id: run.run_id, status, modules: counters }
}
