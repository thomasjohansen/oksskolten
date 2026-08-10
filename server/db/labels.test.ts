import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { getDb } from './connection.js'
import { createLabel, updateLabel, deleteLabel, getLabels, getArticlesByLabel, getEffectiveArticleLabels } from './labels.js'
import { insertArticle } from './articles.js'

function seedFeed() {
  getDb().prepare("INSERT INTO feeds (id, name, url) VALUES (1, 'Feed', 'https://f.com')").run()
}

let urlSeq = 0
function addArticle(title: string): number {
  return insertArticle({ feed_id: 1, title, url: `https://f.com/${urlSeq++}`, published_at: '2026-01-01T00:00:00Z' })
}

function orRule(text: string) {
  return { match_text: text, match_field: 'title' as const, rule_type: 'or' as const }
}

function memberCount(labelId: number): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM article_labels WHERE label_id = ?').get(labelId) as { n: number }).n
}

beforeEach(() => {
  setupTestDb()
  seedFeed()
})

describe('label membership materialization', () => {
  it('returns AI-only effective membership with provenance', () => {
    const articleId = addArticle('Unrelated article')
    const label = createLabel({ name: 'AI label', rules: [] })
    getDb().prepare("UPDATE labels SET origin = 'ai' WHERE id = ?").run(label.id)
    getDb().prepare("INSERT INTO article_ai_labels (article_id, label_id, confidence, source_content_hash) VALUES (?, ?, 0.91, 'hash-ai')").run(articleId, label.id)

    expect(getEffectiveArticleLabels(articleId)).toEqual([expect.objectContaining({
      id: label.id, name: 'AI label', origin: 'ai', ai_confidence: 0.91,
      ai_source_content_hash: 'hash-ai', ai_provenance: 'omos.ai-labels',
    })])
  })

  it('returns rule-only effective membership without AI metadata', () => {
    const articleId = addArticle('Apple news')
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })

    expect(getEffectiveArticleLabels(articleId)).toEqual([{
      id: label.id, name: 'Fruit', origin: 'user', ai_confidence: null,
      ai_source_content_hash: null, ai_provenance: null,
    }])
  })

  it('deduplicates combined rule and AI membership', () => {
    const articleId = addArticle('Apple news')
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })
    getDb().prepare("INSERT INTO article_ai_labels (article_id, label_id, confidence, source_content_hash) VALUES (?, ?, 0.88, 'hash-combined')").run(articleId, label.id)

    expect(getEffectiveArticleLabels(articleId)).toHaveLength(1)
    expect(getEffectiveArticleLabels(articleId)[0].ai_confidence).toBe(0.88)
  })

  it('returns no effective labels for an absent article', () => {
    expect(getEffectiveArticleLabels(999999)).toEqual([])
  })

  it('rebuilds membership for existing articles when a label is created', () => {
    addArticle('Apple news')
    addArticle('Banana bread')

    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })

    expect(memberCount(label.id)).toBe(1)
    const { items, total } = getArticlesByLabel(label.id, { limit: 20, offset: 0 })
    expect(total).toBe(1)
    expect(items[0].title).toBe('Apple news')
  })

  it('updates membership incrementally when an article is inserted', () => {
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })
    expect(memberCount(label.id)).toBe(0)

    addArticle('Apple pie')

    expect(memberCount(label.id)).toBe(1)
    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('reflects counts (including unread-only) in getLabels', () => {
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })
    const readId = addArticle('Apple tart')
    addArticle('Apple juice') // unread

    getDb().prepare("UPDATE articles SET seen_at = datetime('now') WHERE id = ?").run(readId)

    const all = getLabels().find(l => l.id === label.id)
    const unread = getLabels({ unreadOnly: true }).find(l => l.id === label.id)
    expect(all?.article_count).toBe(2)
    expect(unread?.article_count).toBe(1)
  })

  it('excludes articles claimed by a higher-priority exclusive label', () => {
    const exclusive = createLabel({ name: 'Breaking', exclusive: true, rules: [orRule('news')] })
    const general = createLabel({ name: 'General', rules: [orRule('news')] })

    addArticle('Tech news')

    expect(getArticlesByLabel(exclusive.id, { limit: 20, offset: 0 }).total).toBe(1)
    expect(getArticlesByLabel(general.id, { limit: 20, offset: 0 }).total).toBe(0)
  })

  it('rebuilds membership when label rules change', () => {
    addArticle('Apple news')
    addArticle('Banana bread')
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })
    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).items[0].title).toBe('Apple news')

    updateLabel(label.id, { rules: [orRule('banana')] })

    const { items, total } = getArticlesByLabel(label.id, { limit: 20, offset: 0 })
    expect(total).toBe(1)
    expect(items[0].title).toBe('Banana bread')
  })

  it('releases the exclusive claim when the exclusive label is deleted', () => {
    const exclusive = createLabel({ name: 'Breaking', exclusive: true, rules: [orRule('news')] })
    const general = createLabel({ name: 'General', rules: [orRule('news')] })
    addArticle('Tech news')
    expect(getArticlesByLabel(general.id, { limit: 20, offset: 0 }).total).toBe(0)

    deleteLabel(exclusive.id)

    expect(getArticlesByLabel(general.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('counts AI membership once and preserves it across rule rebuilds', () => {
    const label = createLabel({ name: 'Climate', rules: [orRule('climate')] })
    const id = addArticle('Other article')
    const duplicateId = addArticle('climate policy')
    getDb().prepare("INSERT INTO article_ai_labels (article_id, label_id, confidence, source_content_hash) VALUES (?, ?, 0.9, 'hash')").run(id, label.id)
    getDb().prepare("INSERT INTO article_ai_labels (article_id, label_id, confidence, source_content_hash) VALUES (?, ?, 0.9, 'hash')").run(duplicateId, label.id)
    expect(getLabels().find(item => item.id === label.id)?.article_count).toBe(2)
    updateLabel(label.id, { rules: [orRule('different')] })
    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).total).toBe(2)
  })

  it('allows AI-created labels to have empty rules but not manual labels', () => {
    const ai = getDb().prepare("INSERT INTO labels (name, match_text, match_field, origin, normalized_name) VALUES ('AI Subject', '', 'both', 'ai', 'ai subject')").run().lastInsertRowid as number
    expect(() => updateLabel(Number(ai), { rules: [] })).not.toThrow()
    const manual = createLabel({ name: 'Manual', rules: [orRule('manual')] })
    expect(() => updateLabel(manual.id, { rules: [] })).toThrow(/manual/i)
  })
})
