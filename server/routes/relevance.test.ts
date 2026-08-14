import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'

beforeEach(() => setupTestDb())

describe('relevance API', () => {
  it('accepts only a reading brief and keeps unchanged saves at the same revision', async () => {
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/settings/relevance' })).json()).toEqual({ brief: null, revision: 0, configured: false })
    expect((await app.inject({ method: 'PUT', url: '/api/settings/relevance', payload: { brief: 'Climate policy' } })).json()).toEqual({ brief: 'Climate policy', revision: 1, configured: true })
    expect((await app.inject({ method: 'PUT', url: '/api/settings/relevance', payload: { brief: 'Climate policy' } })).json()).toEqual({ brief: 'Climate policy', revision: 1, configured: true })
    expect((await app.inject({ method: 'PUT', url: '/api/settings/relevance', payload: { brief: '' } })).json()).toEqual({ brief: null, revision: 2, configured: false })
    expect((await app.inject({ method: 'PUT', url: '/api/settings/relevance', payload: { profile: {} } })).statusCode).toBe(400)
    await app.close()
  })

  it('returns relevance only for the current brief revision', async () => {
    const feed = createFeed({ name: 'API', url: 'https://api-relevance.test/rss' })
    const id = insertArticle({ feed_id: feed.id, title: 'Article', url: 'https://api-relevance.test/article', published_at: null, full_text: 'body' })
    const app = await buildApp()
    await app.inject({ method: 'PUT', url: '/api/settings/relevance', payload: { brief: 'brief' } })
    getDb().prepare("INSERT INTO article_relevance (article_id, score, reason, content_hash, brief_hash, brief_revision) VALUES (?, 70, 'Relevant article.', 'content', 'brief', 1)").run(id)
    expect((await app.inject({ method: 'GET', url: `/api/articles/${id}/relevance` })).json()).toEqual({ relevance: null })
    await app.close()
  })
})
