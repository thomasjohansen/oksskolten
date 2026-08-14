import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle, updateArticleContent } from '../db.js'
import { getDb } from '../db/connection.js'

const { assessArticleRelevance } = vi.hoisted(() => ({ assessArticleRelevance: vi.fn() }))
vi.mock('../fetcher/ai.js', async () => {
  const actual = await vi.importActual<typeof import('../fetcher/ai.js')>('../fetcher/ai.js')
  return { ...actual, assessArticleRelevance }
})

import { enqueueRelevanceForArticle, getArticleRelevance, getRelevanceBrief, getRelevanceJob, runRelevanceJobs, setRelevanceBrief } from './relevance.js'

beforeEach(() => {
  setupTestDb()
  assessArticleRelevance.mockReset()
})

function article(content = 'article body', title = 'Article'): number {
  const feed = createFeed({ name: 'Relevance feed', url: `https://relevance-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title, url: `https://relevance-${Math.random()}.test/article`, published_at: null, full_text: content })
}

describe('bundled Relevance plugin', () => {
  it('does nothing without a non-empty reading brief', () => {
    const id = article()
    expect(getRelevanceBrief()).toEqual({ brief: null, revision: 0, configured: false })
    expect(enqueueRelevanceForArticle(id)).toBeNull()
  })

  it('validates and persists the AI direct score and reason with article metadata', async () => {
    const id = article('Climate policy article body', 'Climate action')
    setRelevanceBrief('Articles about climate policy')
    assessArticleRelevance.mockResolvedValue({ score: 87, reason: 'Directly covers climate policy.' })

    await runRelevanceJobs()

    expect(assessArticleRelevance).toHaveBeenCalledWith(
      'Climate policy article body',
      'Articles about climate policy',
      { title: 'Climate action', feedName: 'Relevance feed', url: expect.stringContaining('/article') },
    )
    expect(getArticleRelevance(id)).toMatchObject({ score: 87, reason: 'Directly covers climate policy.', brief_revision: 1 })
    expect(getRelevanceJob(id)).toMatchObject({ status: 'succeeded' })
  })

  it('rejects malformed direct output as a retryable failure', async () => {
    setRelevanceBrief('Climate policy')
    assessArticleRelevance.mockResolvedValue({ score: 101, reason: '' })
    const id = article()

    await runRelevanceJobs()

    expect(getArticleRelevance(id)).toBeNull()
    expect(getRelevanceJob(id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/score|reason/i) })
  })

  it('increments once and bulk requeues eligible articles only when the brief changes', () => {
    const first = article('first')
    const second = article('second')

    expect(setRelevanceBrief('Climate policy')).toBe(1)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs WHERE brief_revision = 1').get()).toMatchObject({ count: 2 })
    expect(setRelevanceBrief('Climate policy')).toBe(1)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs').get()).toMatchObject({ count: 2 })
    expect(setRelevanceBrief('Local government')).toBe(2)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs WHERE brief_revision = 2 AND status = \'pending\'').get()).toMatchObject({ count: 2 })
    expect(getRelevanceJob(first)).toMatchObject({ brief_revision: 2 })
    expect(getRelevanceJob(second)).toMatchObject({ brief_revision: 2 })
  })

  it('clears the brief without requeueing and makes old results unavailable', async () => {
    const id = article()
    setRelevanceBrief('Climate policy')
    assessArticleRelevance.mockResolvedValue({ score: 80, reason: 'Relevant.' })
    await runRelevanceJobs()

    expect(setRelevanceBrief('')).toBe(2)
    expect(getRelevanceBrief()).toEqual({ brief: null, revision: 2, configured: false })
    expect(getArticleRelevance(id)).toBeNull()
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs').get()).toMatchObject({ count: 1 })
  })

  it('supersedes stale jobs and never persists their results', async () => {
    const id = article('old content')
    setRelevanceBrief('old brief')
    let release!: () => void
    assessArticleRelevance.mockImplementation(async () => {
      await new Promise<void>(resolve => { release = resolve })
      return { score: 80, reason: 'Old result.' }
    })

    const run = runRelevanceJobs()
    updateArticleContent(id, { full_text: 'new content' })
    setRelevanceBrief('new brief')
    release()
    await run

    expect(getArticleRelevance(id)).toBeNull()
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM relevance_jobs WHERE article_id = ? AND brief_revision = 2 AND status = 'pending'").get(id)).toMatchObject({ count: 1 })
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM relevance_jobs WHERE article_id = ? AND status = 'superseded'").get(id)).toMatchObject({ count: 1 })
  })

  it('preserves retry backoff and dead-letter behavior', async () => {
    setRelevanceBrief('brief')
    assessArticleRelevance.mockRejectedValue(new Error('provider down'))
    article()
    const now = Date.now()

    await runRelevanceJobs({ now, random: () => 0 })
    for (let i = 0; i < 4; i++) await runRelevanceJobs({ now: now + (2 ** (i + 1)) * 1_000, random: () => 0 })

    expect(getRelevanceJob(1)).toMatchObject({ status: 'dead', attempts: 5 })
  })
})
