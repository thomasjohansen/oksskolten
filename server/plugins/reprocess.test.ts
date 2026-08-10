import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'
import { setRelevanceBrief } from './relevance.js'
import { getReprocessRun, reprocessArticles } from './reprocess.js'

beforeEach(() => setupTestDb())

function article(title: string): number {
  const feed = createFeed({ name: `Reprocess ${Math.random()}`, url: `https://reprocess-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title, url: `https://reprocess-${Math.random()}.test/${title}`, published_at: null, full_text: 'content' })
}

describe('tracked reprocess runs', () => {
  it('captures every returned job id, including reused idempotent jobs', () => {
    const id = article('article')
    const first = reprocessArticles({ modules: ['summary'], limit: 1 })
    const firstItem = getDb().prepare('SELECT run_id, article_id, module, job_id FROM reprocess_run_items WHERE run_id = ?').get(first.run_id) as { run_id: string; article_id: number; module: string; job_id: number }
    expect(firstItem).toMatchObject({ run_id: first.run_id, article_id: id, module: 'summary' })
    expect(firstItem.job_id).toBe((getDb().prepare('SELECT id FROM summary_jobs WHERE article_id = ?').get(id) as { id: number }).id)
    const second = reprocessArticles({ modules: ['summary'], limit: 1 })
    const secondItem = getDb().prepare('SELECT job_id FROM reprocess_run_items WHERE run_id = ?').get(second.run_id) as { job_id: number }
    expect(secondItem.job_id).toBe(firstItem.job_id)
  })

  it('aggregates live job states and persists terminal status', () => {
    setRelevanceBrief('brief')
    const id = article('stateful')
    const run = reprocessArticles({ modules: ['relevance'], limit: 1 })
    const job = getDb().prepare('SELECT id FROM relevance_jobs WHERE article_id = ?').get(id) as { id: number }
    expect(getReprocessRun(run.run_id)).toMatchObject({ status: 'running', modules: { relevance: { total: 1, pending: 1, running: 0, succeeded: 0, failed: 0, skipped: 0 } } })
    getDb().prepare("UPDATE relevance_jobs SET status = 'failed' WHERE id = ?").run(job.id)
    expect(getReprocessRun(run.run_id)).toMatchObject({ status: 'failed', modules: { relevance: { total: 1, pending: 0, running: 0, succeeded: 0, failed: 1, skipped: 0 } } })
  })
})
