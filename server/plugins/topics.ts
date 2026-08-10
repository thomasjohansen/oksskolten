import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../db/connection.js'
import { extractArticleTopics } from '../fetcher/ai.js'
import { isStaticPluginEnabled } from './controls.js'

export const TOPICS_PLUGIN_MANIFEST = Object.freeze({ id: 'omos.topics', name: 'Topics', version: '1.0.0', kind: 'bundled-first-party' })
const MAX_ATTEMPTS = 5; const LEASE_MS = 120_000; const MAX_BACKOFF_MS = 30 * 60 * 1000; const MAX_TOPICS = 7; const MAX_TOPIC_LENGTH = 80
export type TopicsJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead' | 'superseded'
export interface TopicsJob { id: number; article_id: number; content_hash: string; status: TopicsJobStatus; attempts: number; available_at: number; lease_token: string | null; lease_expires_at: number | null; error: string | null; created_at: string; updated_at: string; completed_at: string | null }
export interface ArticleTopics { topics: string[]; source_content_hash: string; created_at: string; updated_at: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export function enqueueTopicsForArticle(articleId: number): number | null {
  const article = getDb().prepare('SELECT full_text FROM articles WHERE id = ?').get(articleId) as { full_text: string | null } | undefined
  if (!article?.full_text?.trim() || !isStaticPluginEnabled('omos.topics')) return null
  const contentHash = hash(article.full_text); const db = getDb()
  db.prepare('INSERT INTO topics_jobs (article_id, content_hash, available_at) VALUES (?, ?, ?) ON CONFLICT(article_id, content_hash) DO NOTHING').run(articleId, contentHash, Date.now())
  return (db.prepare('SELECT id FROM topics_jobs WHERE article_id = ? AND content_hash = ?').get(articleId, contentHash) as { id: number }).id
}
export function getTopicsJob(articleId: number): TopicsJob | undefined { return getDb().prepare('SELECT * FROM topics_jobs WHERE article_id = ? ORDER BY id DESC LIMIT 1').get(articleId) as TopicsJob | undefined }
export function getArticleTopics(articleId: number): ArticleTopics | null {
  const row = getDb().prepare('SELECT * FROM article_topics WHERE article_id = ?').get(articleId) as { topics_json: string; source_content_hash: string; created_at: string; updated_at: string } | undefined
  return row ? { topics: JSON.parse(row.topics_json) as string[], source_content_hash: row.source_content_hash, created_at: row.created_at, updated_at: row.updated_at } : null
}
function retryAt(attempts: number, now: number, random: () => number): number { const base = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempts - 1))); return now + base + Math.floor(random() * Math.min(base * 0.25, 30_000)) }
function recoverExpired(now: number): void { const db = getDb(); const rows = db.prepare("SELECT id, attempts FROM topics_jobs WHERE status = 'running' AND lease_expires_at <= ?").all(now) as Array<{ id: number; attempts: number }>; for (const row of rows) { const dead = row.attempts >= MAX_ATTEMPTS; db.prepare(`UPDATE topics_jobs SET status = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(dead ? 'dead' : 'failed', dead ? now : retryAt(row.attempts, now, () => 0), row.id) } }
function validateTopics(value: unknown): string[] { if (!Array.isArray(value) || value.length > MAX_TOPICS) throw new Error('Topics must be a list of at most 7 topics'); const topics = value.map(v => typeof v === 'string' ? v.trim() : ''); if (topics.some(v => !v || v.length > MAX_TOPIC_LENGTH)) throw new Error('Topics must be concise non-empty strings'); if (new Set(topics.map(v => v.toLowerCase())).size !== topics.length) throw new Error('Topics must be distinct'); return topics }

export async function runTopicsJobs(options: { batchSize?: number; concurrency?: number; now?: number; random?: () => number } = {}): Promise<number> {
  const now = options.now ?? Date.now(); const random = options.random ?? Math.random; const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10)); const concurrency = Math.max(1, Math.min(batchSize, options.concurrency ?? 2)); const db = getDb(); recoverExpired(now)
  if (!isStaticPluginEnabled('omos.topics')) return 0
  const jobs = db.prepare("SELECT * FROM topics_jobs WHERE status IN ('pending', 'failed') AND available_at <= ? ORDER BY available_at, id LIMIT ?").all(now, batchSize) as TopicsJob[]
  for (const job of jobs) { const token = randomUUID(); if (db.prepare("UPDATE topics_jobs SET status = 'running', attempts = attempts + 1, lease_token = ?, lease_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'failed')").run(token, now + LEASE_MS, job.id).changes === 1) job.lease_token = token }
  let next = 0; const worker = async () => { while (next < jobs.length) { const job = jobs[next++]; if (!job.lease_token) continue; try {
    const before = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
    if (!before?.full_text?.trim() || hash(before.full_text) !== job.content_hash) throw new Error('Stale topics input')
    if (!isStaticPluginEnabled('omos.topics')) { db.prepare("UPDATE topics_jobs SET status = 'superseded', error = 'Plugin disabled', completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token); continue }
    const topics = validateTopics(await extractArticleTopics(before.full_text)); const current = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
    if (!current?.full_text?.trim() || hash(current.full_text) !== job.content_hash) { db.prepare("UPDATE topics_jobs SET status = 'superseded', error = 'Stale topics input', completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token); enqueueTopicsForArticle(job.article_id); continue }
    db.transaction(() => { db.prepare(`INSERT INTO article_topics (article_id, topics_json, source_content_hash) VALUES (?, ?, ?) ON CONFLICT(article_id) DO UPDATE SET topics_json = excluded.topics_json, source_content_hash = excluded.source_content_hash, updated_at = datetime('now')`).run(job.article_id, JSON.stringify(topics), job.content_hash); db.prepare("UPDATE topics_jobs SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token) })()
  } catch (error) { const message = error instanceof Error ? error.message : String(error); const attempts = (db.prepare('SELECT attempts FROM topics_jobs WHERE id = ?').get(job.id) as { attempts: number }).attempts; const dead = attempts >= MAX_ATTEMPTS; db.prepare(`UPDATE topics_jobs SET status = ?, error = ?, available_at = ?, completed_at = ${dead || message === 'Stale topics input' ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?`).run(message === 'Stale topics input' ? 'superseded' : dead ? 'dead' : 'failed', message, dead ? now : retryAt(attempts, now, random), job.id, job.lease_token); if (message === 'Stale topics input') enqueueTopicsForArticle(job.article_id) } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker)); return jobs.length
}
