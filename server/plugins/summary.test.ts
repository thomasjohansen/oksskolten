import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle, updateArticleContent } from '../db.js'
import { getDb } from '../db/connection.js'

const { summarizeArticle } = vi.hoisted(() => ({ summarizeArticle: vi.fn() }))
vi.mock('../fetcher/ai.js', () => ({ summarizeArticle }))

import { SUMMARY_PLUGIN_MANIFEST, enqueueSummaryForArticle, getSummaryJob, retrySummaryJob, runSummaryJobs } from './summary.js'

beforeEach(() => {
  setupTestDb()
  summarizeArticle.mockReset()
})

function article(content: string | null = 'article body'): number {
  const feed = createFeed({ name: 'Summary', url: `https://summary-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title: 'Article', url: `https://summary-${Math.random()}.test/article`, published_at: null, full_text: content })
}

describe('bundled Summary plugin', () => {
  it('has an explicit first-party manifest and enqueues only non-empty content', () => {
    expect(SUMMARY_PLUGIN_MANIFEST).toMatchObject({ id: 'omos.summary', version: expect.any(String), name: 'Summary' })
    const id = article('  useful content  ')
    const jobId = enqueueSummaryForArticle(id)
    expect(jobId).not.toBeNull()
    expect(getSummaryJob(id)).toMatchObject({ article_id: id, status: 'pending' })
    expect(enqueueSummaryForArticle(article('   '))).toBeNull()
  })

  it('enqueues a new hash when persisted content changes', () => {
    const id = article('old content')
    const first = enqueueSummaryForArticle(id)
    updateArticleContent(id, { full_text: 'new content' })
    const second = enqueueSummaryForArticle(id)
    expect(second).not.toBe(first)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM summary_jobs WHERE article_id = ?').get(id)).toMatchObject({ count: 2 })
  })

  it('runs the provider and persists the summary', async () => {
    summarizeArticle.mockResolvedValue({ summary: 'generated summary' })
    const id = article()
    enqueueSummaryForArticle(id)
    expect(await runSummaryJobs()).toBe(1)
    expect(getDb().prepare('SELECT summary FROM articles WHERE id = ?').get(id)).toMatchObject({ summary: 'generated summary' })
    expect(getSummaryJob(id)).toMatchObject({ status: 'succeeded' })
  })

  it('does not let stale execution overwrite changed content and requeues current hash', async () => {
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    summarizeArticle.mockImplementation(async () => { await waiting; return { summary: 'stale summary' } })
    const id = article('old content')
    enqueueSummaryForArticle(id)
    const run = runSummaryJobs()
    updateArticleContent(id, { full_text: 'new content' })
    release()
    await run
    expect(getDb().prepare('SELECT summary FROM articles WHERE id = ?').get(id)).toMatchObject({ summary: null })
    expect(getDb().prepare("SELECT status FROM summary_jobs WHERE article_id = ? AND status = 'pending'").get(id)).toBeDefined()
  })

  it('backs off failures, exposes them, and eventually marks them dead', async () => {
    summarizeArticle.mockRejectedValue(new Error('provider down'))
    const id = article()
    enqueueSummaryForArticle(id)
    const now = Date.now()
    await runSummaryJobs({ now, random: () => 0 })
    expect(getSummaryJob(id)).toMatchObject({ status: 'failed', error: 'provider down', attempts: 1 })
    expect(retrySummaryJob(id)).toBe(true)
    for (let i = 0; i < 4; i++) await runSummaryJobs({ now: now + (2 ** (i + 1)) * 1_000, random: () => 0 })
    expect(getSummaryJob(id)).toMatchObject({ status: 'dead', attempts: 5 })
  })
})
