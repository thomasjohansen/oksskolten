import { getDb } from '../db/connection.js'
import { enqueueSummaryForArticle } from './summary.js'
import { enqueueRelevanceForArticle } from './relevance.js'
import { enqueueTopicsForArticle } from './topics.js'
import { TOPICS_VERSION } from './topics.js'
import { isStaticPluginEnabled } from './controls.js'

export const REPROCESS_MAX_LIMIT = 50
export type ReprocessModule = 'summary' | 'relevance' | 'topics'
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
  for (const module of ['summary', 'relevance', 'topics'] as const) {
    const selected = requested.includes(module)
    if (!selected) { modules[module] = { queued: 0, skipped: 0 }; continue }
    const before = Number((getDb().prepare(`SELECT COUNT(*) AS count FROM ${module === 'summary' ? 'summary_jobs' : module === 'relevance' ? 'relevance_jobs' : 'topics_jobs'}`).get() as { count: number }).count)
    let replacedTopics = 0
    for (const article of articles) {
      if (module === 'summary') enqueueSummaryForArticle(article.id)
      else if (module === 'relevance') enqueueRelevanceForArticle(article.id)
      else {
        if (!isStaticPluginEnabled('omos.topics')) continue
        const current = getDb().prepare('SELECT topics_version FROM article_topics WHERE article_id = ?').get(article.id) as { topics_version: number } | undefined
        if (!current || current.topics_version < TOPICS_VERSION) {
          replacedTopics++
          getDb().prepare('DELETE FROM topics_jobs WHERE article_id = ?').run(article.id)
          getDb().prepare('DELETE FROM article_topics WHERE article_id = ? AND topics_version < ?').run(article.id, TOPICS_VERSION)
        }
        enqueueTopicsForArticle(article.id)
      }
    }
    const after = Number((getDb().prepare(`SELECT COUNT(*) AS count FROM ${module === 'summary' ? 'summary_jobs' : module === 'relevance' ? 'relevance_jobs' : 'topics_jobs'}`).get() as { count: number }).count)
    const queued = after - before + replacedTopics
    modules[module] = { queued, skipped: articles.length - queued }
  }
  return { limit, selected: articles.length, modules }
}
