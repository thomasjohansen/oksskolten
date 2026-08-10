import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle, getLabels, getArticlesByLabel } from '../db.js'
import { getDb } from '../db/connection.js'
import { setAiLabelsAllowNewLabels } from './controls.js'
const { extractAiLabels } = vi.hoisted(() => ({ extractAiLabels: vi.fn() }))
vi.mock('../fetcher/ai.js', async () => ({ ...(await vi.importActual<typeof import('../fetcher/ai.js')>('../fetcher/ai.js')), extractAiLabels }))
import { enqueueAiLabelsForArticle, normalizeLabelName, runAiLabelJobs, validateAiLabels } from './ai-labels.js'

beforeEach(() => { setupTestDb(); extractAiLabels.mockReset() })
function article(): number { const feed = createFeed({ name: 'AI labels', url: `https://ailabels-${Math.random()}.test/rss` }); return insertArticle({ feed_id: feed.id, title: 'Climate', url: `https://ailabels-${Math.random()}.test/article`, published_at: null, full_text: 'Climate policy article' }) }

describe('AI Labels plugin', () => {
  it('normalizes and reuses existing labels, or creates AI labels when allowed', async () => {
    const existing = getDb().prepare("INSERT INTO labels (name, match_text, match_field, normalized_name, origin) VALUES ('Climate Policy', '', 'both', 'climate policy', 'user')").run().lastInsertRowid as number
    extractAiLabels.mockResolvedValue([{ name: ' CLIMATE   POLICY ', confidence: 0.95 }, { name: 'Public Health', confidence: 0.95, justification: 'A materially distinct recurring subject in this article' }])
    const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs()
    expect(extractAiLabels).toHaveBeenCalledWith('Climate policy article', [{ id: Number(existing), name: 'Climate Policy' }])
    expect(normalizeLabelName(' CLIMATE   POLICY ')).toBe('climate policy')
    expect(getDb().prepare('SELECT label_id, confidence FROM article_ai_labels WHERE article_id = ? ORDER BY label_id').all(id)).toEqual(expect.arrayContaining([{ label_id: Number(existing), confidence: 0.95 }]))
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM labels WHERE origin = 'ai'").get()).toMatchObject({ n: 1 })
  })

  it('assigns existing labels but does not create when auto-create is disabled', async () => {
    setAiLabelsAllowNewLabels(false); extractAiLabels.mockResolvedValue([{ name: 'New Subject', confidence: 0.99 }])
    const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs()
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM labels WHERE name = 'New Subject'").get()).toMatchObject({ n: 0 })
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM article_ai_labels WHERE article_id = ?').get(id)).toMatchObject({ n: 0 })
  })

  it('validates confidence/candidate bounds and keeps stale jobs from writing', async () => {
    expect(() => validateAiLabels([{ name: 'a', confidence: 2 }])).toThrow(/invalid/i)
    let release!: () => void; extractAiLabels.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve }); return [{ name: 'Climate', confidence: 0.9 }] })
    const id = article(); enqueueAiLabelsForArticle(id); const run = runAiLabelJobs(); getDb().prepare("UPDATE articles SET full_text = 'changed' WHERE id = ?").run(id); release(); await run
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM article_ai_labels WHERE article_id = ?').get(id)).toMatchObject({ n: 0 })
    expect(getDb().prepare("SELECT status FROM ai_label_jobs WHERE article_id = ? AND status = 'superseded'").get(id)).toMatchObject({ status: 'superseded' })
  })

  it('records provider failures and reaches dead state after bounded retries', async () => {
    extractAiLabels.mockRejectedValue(new Error('provider down'))
    const id = article(); enqueueAiLabelsForArticle(id); const now = Date.now()
    for (let attempt = 0; attempt < 5; attempt++) await runAiLabelJobs({ now: now + (2 ** attempt) * 1_000 })
    expect(getDb().prepare('SELECT status, attempts FROM ai_label_jobs WHERE article_id = ?').get(id)).toMatchObject({ status: 'dead', attempts: 5 })
  })

  it('keeps new AI labels as candidates but includes them in article membership', async () => {
    extractAiLabels.mockResolvedValue([{ name: 'New Subject', confidence: 0.95, justification: 'A materially distinct recurring subject in this article' }])
    const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs()
    const label = getDb().prepare("SELECT id, lifecycle_status FROM labels WHERE name = 'New Subject'").get() as { id: number; lifecycle_status: string }
    expect(label.lifecycle_status).toBe('candidate')
    expect(getLabels().some(item => item.id === label.id)).toBe(false)
    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('promotes after three articles with two high-confidence assignments', async () => {
    extractAiLabels.mockResolvedValue([{ name: 'Recurring Subject', confidence: 0.95, justification: 'A materially distinct recurring subject in this article' }])
    const first = article(); enqueueAiLabelsForArticle(first); await runAiLabelJobs()
    const second = article(); enqueueAiLabelsForArticle(second); await runAiLabelJobs()
    const third = article(); enqueueAiLabelsForArticle(third); await runAiLabelJobs()
    const label = getDb().prepare("SELECT lifecycle_status FROM labels WHERE name = 'Recurring Subject'").get() as { lifecycle_status: string }
    expect(label.lifecycle_status).toBe('promoted')
  })

  it('promotion is idempotent and does not delete labels or affect user labels', async () => {
    const user = getDb().prepare("INSERT INTO labels (name, match_text, match_field, normalized_name, origin, lifecycle_status) VALUES ('User label', 'Climate', 'title', 'user label', 'user', 'promoted')").run().lastInsertRowid as number
    extractAiLabels.mockResolvedValue([{ name: 'Stable Subject', confidence: 0.95, justification: 'A materially distinct recurring subject in this article' }])
    for (let i = 0; i < 3; i++) { const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs() }
    const before = getDb().prepare('SELECT COUNT(*) AS n FROM labels').get() as { n: number }
    const stable = getDb().prepare("SELECT id, lifecycle_status FROM labels WHERE name = 'Stable Subject'").get() as { id: number; lifecycle_status: string }
    await runAiLabelJobs()
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM labels').get() as { n: number }).n).toBe(before.n)
    expect(getDb().prepare('SELECT lifecycle_status FROM labels WHERE id = ?').get(stable.id)).toMatchObject({ lifecycle_status: 'promoted' })
    expect(getDb().prepare('SELECT origin FROM labels WHERE id = ?').get(user)).toMatchObject({ origin: 'user' })
  })

  it('rejects weak, generic, and duplicate novel suggestions', async () => {
    extractAiLabels.mockResolvedValue([
      { name: 'News', confidence: 0.99, justification: 'A generic label' },
      { name: 'Weak Novelty', confidence: 0.89, justification: 'A materially distinct recurring subject in this article' },
      { name: 'Duplicate Novelty', confidence: 0.95, justification: 'A materially distinct recurring subject in this article' },
      { name: ' duplicate   novelty ', confidence: 0.96, justification: 'A materially distinct recurring subject in this article' },
    ])
    const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs()
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM labels WHERE origin = 'ai'").get()).toMatchObject({ n: 0 })
  })

  it('limits assignments to three and novel candidates to one', async () => {
    const existing = ['One', 'Two', 'Three', 'Four'].map(name => getDb().prepare('INSERT INTO labels (name, match_text, match_field, normalized_name, origin) VALUES (?, \'\', \'both\', ?, \'user\')').run(name, name.toLowerCase(),).lastInsertRowid)
    extractAiLabels.mockResolvedValue([
      ...existing.map((_, index) => ({ name: ['One', 'Two', 'Three', 'Four'][index], confidence: 0.95 })),
      { name: 'Novel Subject', confidence: 0.99, justification: 'A materially distinct recurring subject in this article' },
    ])
    const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs()
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM article_ai_labels WHERE article_id = ?').get(id)).toMatchObject({ n: 3 })
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM labels WHERE origin = 'ai'").get()).toMatchObject({ n: 0 })
  })
})
