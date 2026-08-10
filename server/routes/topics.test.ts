import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'

beforeEach(() => setupTestDb())

describe('Topics API', () => {
  it('retires the Topics product endpoint', async () => {
    const feed = createFeed({ name: 'Topics API', url: 'https://topics-api.test/rss' })
    const id = insertArticle({ feed_id: feed.id, title: 'Article', url: 'https://topics-api.test/article', published_at: null, full_text: 'body' })
    getDb().prepare("INSERT INTO article_topics (article_id, topics_json, source_content_hash) VALUES (?, ?, 'hash')").run(id, JSON.stringify(['Climate']))
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: `/api/articles/${id}/topics` })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('authenticates bounded reprocess requests and returns counts', async () => {
    const feed = createFeed({ name: 'Reprocess API', url: 'https://reprocess-api.test/rss' })
    insertArticle({ feed_id: feed.id, title: 'Article', url: 'https://reprocess-api.test/article', published_at: null, full_text: 'body' })
    const app = await buildApp()
    const response = await app.inject({ method: 'POST', url: '/api/internal/reprocess', payload: { modules: ['ai_labels'], limit: 1 } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ limit: 1, selected: 1, modules: { ai_labels: { queued: 0, skipped: 1 } } })
    await app.close()
  })
})
