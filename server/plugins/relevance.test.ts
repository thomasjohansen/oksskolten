import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle, updateArticleContent } from '../db.js'
import { getDb } from '../db/connection.js'

const { assessArticleRelevance } = vi.hoisted(() => ({ assessArticleRelevance: vi.fn() }))
vi.mock('../fetcher/ai.js', async () => {
  const actual = await vi.importActual<typeof import('../fetcher/ai.js')>('../fetcher/ai.js')
  return { ...actual, assessArticleRelevance }
})

import { DEFAULT_RELEVANCE_PROFILE, getRelevanceBrief, setRelevanceBrief, enqueueRelevanceForArticle, getRelevanceJob, getArticleRelevance, runRelevanceJobs, computeRelevanceScore, getRelevanceProfile, setRelevanceProfile } from './relevance.js'

const signals = (value: number, reason = 'Evidence signal.') => Object.fromEntries(['evidence_credibility', 'public_significance', 'information_value', 'constructive_positive_impact', 'clickbait_penalty', 'paywall_penalty', 'distressing_conflict_war_penalty'].map(key => [key, { value, reason }]))

beforeEach(() => {
  setupTestDb()
  assessArticleRelevance.mockReset()
})

function article(content = 'article body'): number {
  const feed = createFeed({ name: 'Relevance', url: `https://relevance-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title: 'Article', url: `https://relevance-${Math.random()}.test/article`, published_at: null, full_text: content })
}

describe('bundled Relevance plugin', () => {
  it('validates versioned Balanced profiles and computes weighted scores deterministically', () => {
    expect(() => setRelevanceProfile({ version: 1, name: 'Balanced', weights: { ...DEFAULT_RELEVANCE_PROFILE.weights, evidence_credibility: 2 } })).toThrow(/weight/i)
    const profile = { ...DEFAULT_RELEVANCE_PROFILE, weights: { ...DEFAULT_RELEVANCE_PROFILE.weights } }
    const value = signals(100)
    expect(computeRelevanceScore(value as never, profile)).toBe(50)
    expect(getRelevanceProfile().profile.name).toBe('Balanced')
  })
  it('does nothing without a non-empty brief', () => {
    const id = article()
    expect(getRelevanceBrief()).toMatchObject({ brief: null, revision: 0 })
    expect(enqueueRelevanceForArticle(id)).toBeNull()
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs').get()).toMatchObject({ count: 0 })
  })

  it('does not turn an already queued job into a provider failure when the brief is cleared', async () => {
    setRelevanceBrief('brief')
    const id = article()
    setRelevanceBrief('')
    await runRelevanceJobs()
    expect(assessArticleRelevance).not.toHaveBeenCalled()
    expect(getRelevanceJob(id)).toMatchObject({ status: 'superseded', error: 'Relevance brief is empty' })
  })

  it('creates a revision and fingerprints content with the brief revision/value', () => {
    const id = article()
    const firstRevision = setRelevanceBrief('Articles about climate policy')
    const first = enqueueRelevanceForArticle(id)
    setRelevanceBrief('Articles about local government')
    const second = enqueueRelevanceForArticle(id)
    expect(firstRevision).toBe(1)
    expect(getRelevanceBrief()).toMatchObject({ revision: 2, brief: 'Articles about local government' })
    expect(second).not.toBe(first)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs WHERE article_id = ?').get(id)).toMatchObject({ count: 2 })
    expect(getRelevanceJob(id)).toMatchObject({ brief_revision: 2 })
  })

  it('validates and persists a successful score and concise reason', async () => {
    setRelevanceBrief('Articles about climate policy')
    assessArticleRelevance.mockResolvedValue(signals(0, 'Directly covers climate policy.'))
    const id = article()
    enqueueRelevanceForArticle(id)
    await runRelevanceJobs()
    expect(getArticleRelevance(id)).toMatchObject({ score: 0, reason: 'Directly covers climate policy.' })
    expect(getRelevanceJob(id)).toMatchObject({ status: 'succeeded' })
  })

  it('rejects invalid score or reason as a retryable failure', async () => {
    setRelevanceBrief('Articles about climate policy')
    assessArticleRelevance.mockResolvedValue({ ...signals(0), evidence_credibility: { value: 101, reason: 'x' } })
    const id = article()
    enqueueRelevanceForArticle(id)
    await runRelevanceJobs()
    expect(getRelevanceJob(id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/signal/i) })
  })

  it('ignores stale content and stale brief results', async () => {
    setRelevanceBrief('old brief')
    let release!: () => void
    assessArticleRelevance.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve }); return signals(80, 'stale') })
    const id = article()
    enqueueRelevanceForArticle(id)
    const run = runRelevanceJobs()
    updateArticleContent(id, { full_text: 'new content' })
    setRelevanceBrief('new brief')
    release()
    await run
    expect(getArticleRelevance(id)).toBeNull()
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM relevance_jobs WHERE article_id = ? AND brief_revision = 2 AND status = 'pending'").get(id)).toMatchObject({ count: 1 })
  })

  it('backs off failures and eventually reaches dead state', async () => {
    setRelevanceBrief('brief')
    assessArticleRelevance.mockRejectedValue(new Error('provider down'))
    const id = article()
    enqueueRelevanceForArticle(id)
    const now = Date.now()
    await runRelevanceJobs({ now, random: () => 0 })
    expect(getRelevanceJob(id)).toMatchObject({ status: 'failed', attempts: 1 })
    for (let i = 0; i < 4; i++) await runRelevanceJobs({ now: now + (2 ** (i + 1)) * 1_000, random: () => 0 })
    expect(getRelevanceJob(id)).toMatchObject({ status: 'dead', attempts: 5 })
  })

  it('keeps Summary enqueueing independent from Relevance', () => {
    setRelevanceBrief('brief')
    const id = article()
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM summary_jobs WHERE article_id = ?').get(id)).toMatchObject({ count: 1 })
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM relevance_jobs WHERE article_id = ?').get(id)).toMatchObject({ count: 1 })
  })
})
