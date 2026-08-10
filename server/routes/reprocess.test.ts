import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'
import { setRelevanceBrief } from '../plugins/relevance.js'

beforeEach(() => setupTestDb())

function article(): number {
  const feed = createFeed({ name: `Route reprocess ${Math.random()}`, url: `https://route-reprocess-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title: 'Article', url: `https://route-reprocess-${Math.random()}.test/article`, published_at: null, full_text: 'content' })
}

describe('reprocess API', () => {
  it('creates a run and reports per-module aggregation and terminal transition', async () => {
    const id = article()
    setRelevanceBrief('brief')
    const app = await buildApp()
    const created = await app.inject({ method: 'POST', url: '/api/internal/reprocess', payload: { modules: ['summary', 'relevance', 'ai_labels'], limit: 1 } })
    expect(created.statusCode).toBe(200)
    const { run_id: runId } = created.json() as { run_id: string }
    expect(runId).toMatch(/^[0-9a-f-]{36}$/)
    expect((getDb().prepare('SELECT COUNT(*) AS count FROM reprocess_run_items WHERE run_id = ?').get(runId) as { count: number }).count).toBe(3)

    const initial = await app.inject({ method: 'GET', url: `/api/internal/reprocess/${runId}` })
    expect(initial.json()).toMatchObject({ run_id: runId, status: 'running', modules: { summary: { total: 1, pending: 1 }, relevance: { total: 1, pending: 1 }, ai_labels: { total: 1, pending: 1 } } })
    const jobs = getDb().prepare('SELECT id, article_id FROM summary_jobs WHERE article_id = ?').get(id) as { id: number; article_id: number }
    getDb().prepare("UPDATE summary_jobs SET status = 'succeeded' WHERE id = ?").run(jobs.id)
    getDb().prepare("UPDATE relevance_jobs SET status = 'superseded' WHERE article_id = ?").run(id)
    getDb().prepare("UPDATE ai_label_jobs SET status = 'failed' WHERE article_id = ?").run(id)
    const terminal = await app.inject({ method: 'GET', url: `/api/internal/reprocess/${runId}` })
    expect(terminal.json()).toMatchObject({ status: 'failed', modules: { summary: { succeeded: 1 }, relevance: { skipped: 1 }, ai_labels: { failed: 1 } } })
    expect((getDb().prepare('SELECT status FROM reprocess_runs WHERE run_id = ?').get(runId) as { status: string }).status).toBe('failed')
    await app.close()
  })

  it('returns 404 for an unknown run', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/internal/reprocess/not-a-run' })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})
