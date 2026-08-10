import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'
import { getStaticPluginHealth, isStaticPluginEnabled, setStaticPluginEnabled } from './controls.js'
import { enqueueSummaryForArticle, runSummaryJobs } from './summary.js'

beforeEach(() => setupTestDb())

function article(): number { const feed = createFeed({ name: 'Controls', url: `https://controls-${Math.random()}.test/rss` }); return insertArticle({ feed_id: feed.id, title: 'Article', url: `https://controls-${Math.random()}.test/article`, published_at: null, full_text: 'body' }) }

describe('static plugin controls', () => {
  it('persist enablement, suppresses pending work, and reports health', async () => {
    const id = article()
    setStaticPluginEnabled('omos.summary', false)
    expect(isStaticPluginEnabled('omos.summary')).toBe(false)
    expect(enqueueSummaryForArticle(id)).toBeNull()
    expect(await runSummaryJobs()).toBe(0)
    expect(getStaticPluginHealth('omos.summary')).toMatchObject({ enabled: false, pending: 0, running: 0 })
    expect(getDb().prepare('SELECT summary FROM articles WHERE id = ?').get(id)).toMatchObject({ summary: null })
    setStaticPluginEnabled('omos.summary', true)
  })
})
