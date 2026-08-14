import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'
import { setRelevanceBrief } from '../plugins/relevance.js'

beforeEach(() => setupTestDb())

describe('GET /api/articles?sort=relevance', () => {
  it('orders only results from the current reading brief before unscored articles', async () => {
    const feed = createFeed({ name: 'Sort', url: 'https://sort-relevance.test/rss' })
    const stale = insertArticle({ feed_id: feed.id, title: 'Stale', url: 'https://sort-relevance.test/stale', published_at: '2025-01-03T00:00:00Z', full_text: 'stale' })
    const current = insertArticle({ feed_id: feed.id, title: 'Current', url: 'https://sort-relevance.test/current', published_at: '2025-01-02T00:00:00Z', full_text: 'current' })
    const none = insertArticle({ feed_id: feed.id, title: 'None', url: 'https://sort-relevance.test/none', published_at: '2025-01-01T00:00:00Z', full_text: 'none' })
    setRelevanceBrief('first')
    setRelevanceBrief('second')
    getDb().prepare("INSERT INTO article_relevance (article_id, score, reason, content_hash, brief_hash, brief_revision) VALUES (?, 99, 'stale', 'a', 'b', 1), (?, 70, 'current', 'c', 'd', 2)").run(stale, current)
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/articles?sort=relevance&no_floor=1&limit=10' })
    expect(response.json().articles.map((article: { id: number; relevance_score: number | null }) => [article.id, article.relevance_score])).toEqual([[current, 70], [stale, null], [none, null]])
    await app.close()
  })
})
