import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'

beforeEach(() => setupTestDb())

describe('GET /api/articles?sort=relevance', () => {
  it('returns scored articles first with relevance_score and unscored last', async () => {
    const feed = createFeed({ name: 'Sort', url: 'https://sort-relevance.test/rss' })
    const low = insertArticle({ feed_id: feed.id, title: 'Low', url: 'https://sort-relevance.test/low', published_at: '2025-01-01T00:00:00Z', full_text: 'low' })
    const high = insertArticle({ feed_id: feed.id, title: 'High', url: 'https://sort-relevance.test/high', published_at: '2025-01-02T00:00:00Z', full_text: 'high' })
    const none = insertArticle({ feed_id: feed.id, title: 'None', url: 'https://sort-relevance.test/none', published_at: '2025-01-03T00:00:00Z', full_text: 'none' })
    getDb().prepare("INSERT INTO article_relevance (article_id, score, reason, content_hash, brief_hash, brief_revision, signals_json, profile_hash) VALUES (?, 40, 'low', 'a', 'b', 1, '{}', 'b'), (?, 90, 'high', 'c', 'd', 1, '{}', 'd')").run(low, high)
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/articles?sort=relevance&no_floor=1&limit=10' })
    expect(response.statusCode).toBe(200)
    expect(response.json().articles.map((article: { id: number; relevance_score: number | null }) => [article.id, article.relevance_score])).toEqual([[high, 90], [low, 40], [none, null]])
    await app.close()
  })
})
