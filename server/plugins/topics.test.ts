import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle, updateArticleContent } from '../db.js'
import { getDb } from '../db/connection.js'

const { extractArticleTopics } = vi.hoisted(() => ({ extractArticleTopics: vi.fn() }))
vi.mock('../fetcher/ai.js', async () => {
  const actual = await vi.importActual<typeof import('../fetcher/ai.js')>('../fetcher/ai.js')
  return { ...actual, extractArticleTopics }
})

import { TOPICS_PLUGIN_MANIFEST, enqueueTopicsForArticle, getArticleTopics, getTopicsJob, runTopicsJobs } from './topics.js'

beforeEach(() => { setupTestDb(); extractArticleTopics.mockReset() })

function article(content = 'article body'): number {
  const feed = createFeed({ name: 'Topics', url: `https://topics-${Math.random()}.test/rss` })
  return insertArticle({ feed_id: feed.id, title: 'Article', url: `https://topics-${Math.random()}.test/article`, published_at: null, full_text: content })
}

describe('bundled Topics plugin', () => {
  it('has a static manifest and persists validated free-form topics', async () => {
    expect(TOPICS_PLUGIN_MANIFEST).toMatchObject({ id: 'omos.topics', name: 'Topics' })
    extractArticleTopics.mockResolvedValue(['Climate policy', 'Renewable energy'])
    const id = article()
    enqueueTopicsForArticle(id)
    await runTopicsJobs()
    expect(getArticleTopics(id)).toMatchObject({ topics: ['Climate policy', 'Renewable energy'] })
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM labels').get()).toMatchObject({ count: 0 })
    expect(getTopicsJob(id)).toMatchObject({ status: 'succeeded' })
  })

  it('rejects oversized or empty topic output as retryable failure', async () => {
    extractArticleTopics.mockResolvedValue(['', ...Array.from({ length: 10 }, (_, i) => `Topic ${i}`)])
    const id = article()
    enqueueTopicsForArticle(id)
    await runTopicsJobs()
    expect(getTopicsJob(id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/topic/i) })
  })

  it('does not persist stale content output and requeues the current hash', async () => {
    let release!: () => void
    extractArticleTopics.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve }); return ['stale'] })
    const id = article('old')
    enqueueTopicsForArticle(id)
    const run = runTopicsJobs()
    updateArticleContent(id, { full_text: 'new' })
    release()
    await run
    expect(getArticleTopics(id)).toBeNull()
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM topics_jobs WHERE article_id = ? AND status = 'pending'").get(id)).toMatchObject({ count: 1 })
  })

  it('backs off provider failures and reaches dead state', async () => {
    extractArticleTopics.mockRejectedValue(new Error('provider down'))
    const id = article()
    enqueueTopicsForArticle(id)
    const now = Date.now()
    await runTopicsJobs({ now, random: () => 0 })
    for (let i = 0; i < 4; i++) await runTopicsJobs({ now: now + (2 ** (i + 1)) * 1_000, random: () => 0 })
    expect(getTopicsJob(id)).toMatchObject({ status: 'dead', attempts: 5 })
  })
})
