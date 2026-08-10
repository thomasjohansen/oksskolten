import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle, markArticleSeen } from '../db.js'
import { getDb } from '../db/connection.js'
import { setRelevanceBrief } from './relevance.js'
import { reprocessArticles } from './reprocess.js'

beforeEach(() => setupTestDb())

function add(title: string): number {
  const feed = createFeed({ name: `Reprocess ${Math.random()}`, url: `https://reprocess-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title, url: `https://reprocess-${Math.random()}.test/${title}`, published_at: null, full_text: 'content' })
}

describe('bounded static-plugin reprocess', () => {
  it('queues unread first, respects bounds, skips relevance without a brief, and is idempotent', () => {
    const unread = add('unread')
    const read = add('read')
    markArticleSeen(read, true)
    const first = reprocessArticles({ modules: ['summary', 'relevance', 'ai_labels'], limit: 1 })
    expect(first).toMatchObject({ limit: 1, selected: 1, modules: { summary: { queued: 0, skipped: 1 }, relevance: { queued: 0, skipped: 1 }, ai_labels: { queued: 0, skipped: 1 } } })
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM summary_jobs WHERE article_id = ?').get(unread)).toMatchObject({ count: 1 })
    setRelevanceBrief('brief')
    const second = reprocessArticles({ modules: ['relevance'], limit: 10 })
    expect(second.modules.relevance.queued).toBe(2)
    expect(reprocessArticles({ modules: ['relevance'], limit: 10 }).modules.relevance.queued).toBe(0)
  })

  it('reprocesses AI Labels idempotently for unchanged content', () => {
    add('existing labels')
    const result = reprocessArticles({ modules: ['ai_labels'], limit: 10 })
    expect(result.modules.ai_labels.queued).toBe(0)
    expect(reprocessArticles({ modules: ['ai_labels'], limit: 10 }).modules.ai_labels.queued).toBe(0)
  })
})
