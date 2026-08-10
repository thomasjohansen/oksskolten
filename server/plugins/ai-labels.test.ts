import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
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
    extractAiLabels.mockResolvedValue([{ name: ' CLIMATE   POLICY ', confidence: 0.95 }, { name: 'Public Health', confidence: 0.9 }])
    const id = article(); enqueueAiLabelsForArticle(id); await runAiLabelJobs()
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
})
