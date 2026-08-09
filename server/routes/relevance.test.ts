import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'
import { setRelevanceBrief } from '../plugins/relevance.js'

beforeEach(() => setupTestDb())

describe('relevance API', () => {
  it('reads and updates the brief with revisions', async () => {
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/settings/relevance' })).json()).toMatchObject({ brief: null, revision: 0 })
    expect((await app.inject({ method: 'PUT', url: '/api/settings/relevance', payload: { brief: 'Climate policy' } })).json()).toMatchObject({ brief: 'Climate policy', revision: 1 })
    await app.close()
  })

  it('returns current article relevance', async () => {
    const feed = createFeed({ name: 'API', url: 'https://api-relevance.test/rss' })
    const id = insertArticle({ feed_id: feed.id, title: 'Article', url: 'https://api-relevance.test/article', published_at: null, full_text: 'body' })
    setRelevanceBrief('brief')
    getDb().prepare("INSERT INTO article_relevance (article_id, score, reason, content_hash, brief_hash, brief_revision) VALUES (?, 70, 'Relevant article.', 'content', 'brief', 1)").run(id)
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: `/api/articles/${id}/relevance` })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ relevance: { score: 70, reason: 'Relevant article.' } })
    await app.close()
  })
})
