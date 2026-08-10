import { beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { createLabel, createFeed, insertArticle } from '../db.js'
import { getDb } from '../db/connection.js'

describe('AI label lifecycle routes', () => {
  let app: FastifyInstance
  beforeEach(async () => { setupTestDb(); app = await buildApp() })

  function aiLabel(name: string, status = 'candidate'): number {
    return Number(getDb().prepare("INSERT INTO labels (name, match_text, match_field, normalized_name, origin, lifecycle_status) VALUES (?, '', 'both', ?, 'ai', ?)").run(name, name.toLowerCase(), status).lastInsertRowid)
  }

  it('keeps candidates out of normal labels and includes them for settings', async () => {
    const candidate = aiLabel('Candidate')
    const dismissed = aiLabel('Dismissed', 'dismissed')
    const promoted = aiLabel('Promoted', 'promoted')
    const normal = await app.inject({ method: 'GET', url: '/api/labels' })
    const settings = await app.inject({ method: 'GET', url: '/api/labels?include_candidates=1' })
    expect(normal.json().labels.map((l: { id: number }) => l.id)).toEqual(expect.arrayContaining([promoted]))
    expect(normal.json().labels.map((l: { id: number }) => l.id)).not.toContain(candidate)
    expect(normal.json().labels.map((l: { id: number }) => l.id)).not.toContain(dismissed)
    expect(settings.json().labels.map((l: { id: number }) => l.id)).toEqual(expect.arrayContaining([candidate, promoted]))
    expect(settings.json().labels.map((l: { id: number }) => l.id)).not.toContain(dismissed)
  })

  it('promotes, dismisses, and merges candidates', async () => {
    const source = aiLabel('Source')
    const target = createLabel({ name: 'Target', rules: [{ match_text: 'target', match_field: 'title', rule_type: 'or' }] })
    const feed = createFeed({ name: 'f', url: 'https://f.test' })
    const article = insertArticle({ feed_id: feed.id, title: 'x', url: 'https://f.test/x', published_at: null })
    getDb().prepare("INSERT INTO article_ai_labels (article_id, label_id, confidence, source_content_hash, provenance) VALUES (?, ?, .95, 'source-hash', 'source')").run(article, source)
    expect((await app.inject({ method: 'POST', url: `/api/labels/${source}/promote`, headers: { 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(200)
    const second = aiLabel('Second')
    expect((await app.inject({ method: 'POST', url: `/api/labels/${second}/dismiss`, headers: { 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(200)
    const third = aiLabel('Third')
    getDb().prepare("INSERT INTO article_ai_labels (article_id, label_id, confidence, source_content_hash, provenance) VALUES (?, ?, .8, 'third-hash', 'third')").run(article, third)
    const merged = await app.inject({ method: 'POST', url: `/api/labels/${third}/merge`, headers: { 'content-type': 'application/json' }, payload: { target_label_id: target.id } })
    expect(merged.statusCode).toBe(200)
    expect(getDb().prepare('SELECT 1 FROM labels WHERE id = ?').get(third)).toBeUndefined()
    expect(getDb().prepare('SELECT label_id, confidence, source_content_hash, provenance FROM article_ai_labels WHERE article_id = ? AND label_id = ?').get(article, target.id)).toMatchObject({ label_id: target.id, confidence: .8, source_content_hash: 'third-hash', provenance: 'third' })
  })

  it('rejects merging into noncandidate or dismissed labels', async () => {
    const source = aiLabel('Source')
    const user = createLabel({ name: 'User', rules: [{ match_text: 'x', match_field: 'title', rule_type: 'or' }] })
    const dismissed = aiLabel('Dismissed', 'dismissed')
    const valid = await app.inject({ method: 'POST', url: `/api/labels/${source}/merge`, headers: { 'content-type': 'application/json' }, payload: { target_label_id: user.id } })
    expect(valid.statusCode).toBe(200)
    const other = aiLabel('Other')
    const response = await app.inject({ method: 'POST', url: `/api/labels/${other}/merge`, headers: { 'content-type': 'application/json' }, payload: { target_label_id: dismissed } })
    expect(response.statusCode).toBe(400)
  })
})
