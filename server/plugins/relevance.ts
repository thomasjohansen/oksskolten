import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../db/connection.js'
import { assessArticleRelevance } from '../fetcher/ai.js'

export const RELEVANCE_PLUGIN_MANIFEST = Object.freeze({ id: 'omos.relevance', name: 'Relevance', version: '1.0.0', kind: 'bundled-first-party' })
const MAX_ATTEMPTS = 5
const LEASE_MS = 120_000
const MAX_BACKOFF_MS = 30 * 60 * 1000

export type RelevanceJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead' | 'superseded'
export interface RelevanceJob {
  id: number; article_id: number; content_hash: string; brief_hash: string; brief_revision: number
  status: RelevanceJobStatus; attempts: number; available_at: number; lease_token: string | null
  lease_expires_at: number | null; error: string | null; created_at: string; updated_at: string; completed_at: string | null
}
export interface ArticleRelevance { score: number; reason: string; content_hash: string; brief_hash: string; brief_revision: number; created_at: string; updated_at: string }

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function relevanceFingerprint(content: string, brief: string, revision: number): string { return hash(`${hash(content)}:${revision}:${hash(brief)}`) }

export function getRelevanceBrief(): { brief: string | null; revision: number } {
  const row = getDb().prepare('SELECT brief, revision FROM relevance_config WHERE id = 1').get() as { brief: string | null; revision: number }
  return { brief: row.brief, revision: row.revision }
}

export function setRelevanceBrief(value: string): number {
  const brief = value.trim()
  const db = getDb()
  const current = getRelevanceBrief()
  if (brief === (current.brief ?? '')) return current.revision
  const revision = current.revision + 1
  db.transaction(() => {
    db.prepare('UPDATE relevance_config SET brief = ?, revision = ?, updated_at = datetime(\'now\') WHERE id = 1').run(brief || null, revision)
    if (brief) db.prepare('INSERT INTO relevance_brief_revisions (revision, brief) VALUES (?, ?)').run(revision, brief)
  })()
  return revision
}

export function enqueueRelevanceForArticle(articleId: number): number | null {
  const article = getDb().prepare('SELECT full_text FROM articles WHERE id = ?').get(articleId) as { full_text: string | null } | undefined
  const config = getRelevanceBrief()
  if (!article?.full_text?.trim() || !config.brief) return null
  const contentHash = hash(article.full_text)
  const briefHash = hash(config.brief)
  const db = getDb()
  db.prepare(`INSERT INTO relevance_jobs (article_id, content_hash, brief_hash, brief_revision, available_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(article_id, content_hash, brief_hash, brief_revision) DO NOTHING`).run(articleId, contentHash, briefHash, config.revision, Date.now())
  const row = db.prepare('SELECT id FROM relevance_jobs WHERE article_id = ? AND content_hash = ? AND brief_hash = ? AND brief_revision = ?').get(articleId, contentHash, briefHash, config.revision) as { id: number }
  return row.id
}

export function getRelevanceJob(articleId: number): RelevanceJob | undefined { return getDb().prepare('SELECT * FROM relevance_jobs WHERE article_id = ? ORDER BY id DESC LIMIT 1').get(articleId) as RelevanceJob | undefined }
export function getArticleRelevance(articleId: number): ArticleRelevance | null { return (getDb().prepare('SELECT * FROM article_relevance WHERE article_id = ?').get(articleId) as ArticleRelevance | undefined) ?? null }

function retryAt(attempts: number, now: number, random: () => number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempts - 1)))
  return now + base + Math.floor(random() * Math.min(base * 0.25, 30_000))
}

function recoverExpired(now: number): void {
  const db = getDb()
  const rows = db.prepare("SELECT id, attempts FROM relevance_jobs WHERE status = 'running' AND lease_expires_at <= ?").all(now) as Array<{ id: number; attempts: number }>
  for (const row of rows) {
    const dead = row.attempts >= MAX_ATTEMPTS
    db.prepare(`UPDATE relevance_jobs SET status = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(dead ? 'dead' : 'failed', dead ? now : retryAt(row.attempts, now, () => 0), row.id)
  }
}

function validateResult(value: unknown): { score: number; reason: string } {
  if (!value || typeof value !== 'object') throw new Error('Invalid relevance JSON')
  const result = value as { score?: unknown; reason?: unknown }
  if (!Number.isInteger(result.score) || (result.score as number) < 0 || (result.score as number) > 100) throw new Error('Relevance score must be an integer from 0 to 100')
  if (typeof result.reason !== 'string' || !result.reason.trim() || result.reason.trim().length > 280) throw new Error('Relevance reason must be concise')
  return { score: result.score as number, reason: result.reason.trim() }
}

export async function runRelevanceJobs(options: { batchSize?: number; concurrency?: number; now?: number; random?: () => number } = {}): Promise<number> {
  const now = options.now ?? Date.now(); const random = options.random ?? Math.random
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10)); const concurrency = Math.max(1, Math.min(batchSize, options.concurrency ?? 2)); const db = getDb()
  recoverExpired(now)
  const jobs = db.prepare("SELECT * FROM relevance_jobs WHERE status IN ('pending', 'failed') AND available_at <= ? ORDER BY available_at, id LIMIT ?").all(now, batchSize) as RelevanceJob[]
  for (const job of jobs) { const token = randomUUID(); if (db.prepare("UPDATE relevance_jobs SET status = 'running', attempts = attempts + 1, lease_token = ?, lease_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'failed')").run(token, now + LEASE_MS, job.id).changes === 1) job.lease_token = token }
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]; if (!job.lease_token) continue
      try {
        const config = getRelevanceBrief()
        if (!config.brief) {
          db.prepare("UPDATE relevance_jobs SET status = 'superseded', error = 'Relevance brief is empty', completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token)
          continue
        }
        const before = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
        if (!before?.full_text?.trim() || hash(before.full_text) !== job.content_hash || config.revision !== job.brief_revision || hash(config.brief) !== job.brief_hash) throw new Error('Stale relevance input')
        const result = validateResult(await assessArticleRelevance(before.full_text, config.brief))
        const current = getRelevanceBrief(); const article = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
        if (!article?.full_text?.trim() || hash(article.full_text) !== job.content_hash || current.revision !== job.brief_revision || !current.brief || hash(current.brief) !== job.brief_hash) { db.prepare("UPDATE relevance_jobs SET status = 'superseded', error = 'Stale relevance input', completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token); enqueueRelevanceForArticle(job.article_id); continue }
        db.transaction(() => {
          db.prepare(`INSERT INTO article_relevance (article_id, score, reason, content_hash, brief_hash, brief_revision) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(article_id) DO UPDATE SET score = excluded.score, reason = excluded.reason, content_hash = excluded.content_hash, brief_hash = excluded.brief_hash, brief_revision = excluded.brief_revision, updated_at = datetime('now')`).run(job.article_id, result.score, result.reason, job.content_hash, job.brief_hash, job.brief_revision)
          db.prepare("UPDATE relevance_jobs SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token)
        })()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error); const attempts = (db.prepare('SELECT attempts FROM relevance_jobs WHERE id = ?').get(job.id) as { attempts: number }).attempts; const dead = attempts >= MAX_ATTEMPTS
        db.prepare(`UPDATE relevance_jobs SET status = ?, error = ?, available_at = ?, completed_at = ${dead || message === 'Stale relevance input' ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?`).run(message === 'Stale relevance input' ? 'superseded' : dead ? 'dead' : 'failed', message, dead ? now : retryAt(attempts, now, random), job.id, job.lease_token)
        if (message === 'Stale relevance input') enqueueRelevanceForArticle(job.article_id)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker)); return jobs.length
}
