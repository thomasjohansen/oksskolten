import { getDb } from '../db/connection.js'
import { enqueueSummaryForArticle } from './summary.js'
import { enqueueRelevanceForArticle } from './relevance.js'
import { enqueueAiLabelsForArticle } from './ai-labels.js'

export const REPROCESS_MAX_LIMIT = 50
export type ReprocessModule = 'summary' | 'relevance' | 'ai_labels'
export interface ReprocessResult {
  limit: number; selected: number
  modules: Record<ReprocessModule, { queued: number; skipped: number }>
}

export function reprocessArticles(options: { modules: ReprocessModule[]; limit?: number }): ReprocessResult {
  const requested = [...new Set(options.modules)]
  const limit = Math.max(1, Math.min(REPROCESS_MAX_LIMIT, Math.floor(options.limit ?? REPROCESS_MAX_LIMIT)))
  const articles = getDb().prepare(`SELECT id FROM articles WHERE full_text IS NOT NULL AND length(trim(full_text)) > 0
    ORDER BY (seen_at IS NULL) DESC, COALESCE(fetched_at, created_at) DESC, id DESC LIMIT ?`).all(limit) as Array<{ id: number }>
  const modules = {} as ReprocessResult['modules']
  for (const module of ['summary', 'relevance', 'ai_labels'] as const) {
    const selected = requested.includes(module)
    if (!selected) { modules[module] = { queued: 0, skipped: 0 }; continue }
    const before = Number((getDb().prepare(`SELECT COUNT(*) AS count FROM ${module === 'summary' ? 'summary_jobs' : module === 'relevance' ? 'relevance_jobs' : 'ai_label_jobs'}`).get() as { count: number }).count)
    for (const article of articles) {
      if (module === 'summary') enqueueSummaryForArticle(article.id)
      else if (module === 'relevance') enqueueRelevanceForArticle(article.id)
      else enqueueAiLabelsForArticle(article.id)
    }
    const after = Number((getDb().prepare(`SELECT COUNT(*) AS count FROM ${module === 'summary' ? 'summary_jobs' : module === 'relevance' ? 'relevance_jobs' : 'ai_label_jobs'}`).get() as { count: number }).count)
    const queued = after - before
    modules[module] = { queued, skipped: articles.length - queued }
  }
  return { limit, selected: articles.length, modules }
}
