import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../db/connection.js'
import { summarizeArticle } from '../fetcher/ai.js'

export const SUMMARY_PLUGIN_MANIFEST = Object.freeze({
  id: 'omos.summary',
  name: 'Summary',
  version: '1.0.0',
  kind: 'bundled-first-party',
})

const MAX_ATTEMPTS = 5
const LEASE_MS = 120_000
const MAX_BACKOFF_MS = 30 * 60 * 1000
export type SummaryJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead'
export interface SummaryJob {
  id: number; article_id: number; full_text_hash: string; status: SummaryJobStatus
  attempts: number; available_at: number; lease_token: string | null
  lease_expires_at: number | null; error: string | null; created_at: string
  updated_at: string; completed_at: string | null
}

export function fullTextHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function enqueueSummaryForArticle(articleId: number): number | null {
  const db = getDb()
  const article = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(articleId) as { full_text: string | null } | undefined
  if (!article?.full_text?.trim()) return null
  const hash = fullTextHash(article.full_text)
  const now = Date.now()
  db.prepare(`INSERT INTO summary_jobs (article_id, full_text_hash, available_at)
    VALUES (?, ?, ?) ON CONFLICT(article_id, full_text_hash) DO UPDATE SET
    status = CASE WHEN summary_jobs.status IN ('dead') THEN 'pending' ELSE summary_jobs.status END,
    available_at = CASE WHEN summary_jobs.status IN ('dead') THEN excluded.available_at ELSE summary_jobs.available_at END,
    error = CASE WHEN summary_jobs.status IN ('dead') THEN NULL ELSE summary_jobs.error END,
    completed_at = CASE WHEN summary_jobs.status IN ('dead') THEN NULL ELSE summary_jobs.completed_at END`).run(articleId, hash, now)
  const row = db.prepare('SELECT id FROM summary_jobs WHERE article_id = ? AND full_text_hash = ?').get(articleId, hash) as { id: number }
  return row.id
}

export function getSummaryJob(articleId: number): SummaryJob | undefined {
  return getDb().prepare('SELECT * FROM summary_jobs WHERE article_id = ? ORDER BY id DESC LIMIT 1').get(articleId) as SummaryJob | undefined
}

export function listSummaryJobs(limit = 50): SummaryJob[] {
  return getDb().prepare('SELECT * FROM summary_jobs ORDER BY id DESC LIMIT ?').all(limit) as SummaryJob[]
}

export function retrySummaryJob(articleId: number): boolean {
  return getDb().prepare(`UPDATE summary_jobs SET status = 'pending', available_at = ?, error = NULL,
    completed_at = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now')
    WHERE article_id = ? AND status IN ('failed', 'dead')`).run(Date.now(), articleId).changes > 0
}

function recoverExpired(now: number): void {
  const db = getDb()
  const rows = db.prepare("SELECT id, attempts FROM summary_jobs WHERE status = 'running' AND lease_expires_at <= ?").all(now) as Array<{ id: number; attempts: number }>
  for (const row of rows) {
    const dead = row.attempts >= MAX_ATTEMPTS
    db.prepare(`UPDATE summary_jobs SET status = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(dead ? 'dead' : 'failed', dead ? now : retryAt(row.attempts, now, () => 0), row.id)
  }
}

function retryAt(attempts: number, now: number, random: () => number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempts - 1)))
  return now + base + Math.floor(random() * Math.min(base * 0.25, 30_000))
}

export async function runSummaryJobs(options: { batchSize?: number; concurrency?: number; now?: number; random?: () => number } = {}): Promise<number> {
  const now = options.now ?? Date.now()
  const random = options.random ?? Math.random
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10))
  const concurrency = Math.max(1, Math.min(batchSize, options.concurrency ?? 2))
  const db = getDb()
  recoverExpired(now)
  const jobs = db.prepare("SELECT * FROM summary_jobs WHERE status IN ('pending', 'failed') AND available_at <= ? ORDER BY available_at, id LIMIT ?").all(now, batchSize) as SummaryJob[]
  for (const job of jobs) {
    const token = randomUUID()
    const claimed = db.prepare("UPDATE summary_jobs SET status = 'running', attempts = attempts + 1, lease_token = ?, lease_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'failed')").run(token, now + LEASE_MS, job.id)
    if (claimed.changes === 1) job.lease_token = token
  }
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      if (!job.lease_token) continue
      try {
        const before = db.prepare('SELECT full_text, lang FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null; lang: string | null } | undefined
        if (!before?.full_text?.trim() || fullTextHash(before.full_text) !== job.full_text_hash) {
          db.prepare("UPDATE summary_jobs SET status = 'failed', error = 'Stale article content', available_at = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(now, job.id, job.lease_token)
          enqueueSummaryForArticle(job.article_id)
          continue
        }
        const result = await summarizeArticle(before.full_text, before.lang)
        const current = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
        if (!current?.full_text?.trim() || fullTextHash(current.full_text) !== job.full_text_hash) {
          db.prepare("UPDATE summary_jobs SET status = 'failed', error = 'Stale article content', available_at = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(now, job.id, job.lease_token)
          enqueueSummaryForArticle(job.article_id)
          continue
        }
        db.transaction(() => {
          db.prepare('UPDATE articles SET summary = ? WHERE id = ?').run(result.summary, job.article_id)
          db.prepare("UPDATE summary_jobs SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token)
        })()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const attempts = (db.prepare('SELECT attempts FROM summary_jobs WHERE id = ?').get(job.id) as { attempts: number }).attempts
        const dead = attempts >= MAX_ATTEMPTS
        db.prepare(`UPDATE summary_jobs SET status = ?, error = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND lease_token = ?`).run(dead ? 'dead' : 'failed', message, dead ? now : retryAt(attempts, now, random), job.id, job.lease_token)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
  return jobs.length
}
