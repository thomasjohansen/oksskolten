import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../db/connection.js'
import { assessArticleRelevance } from '../fetcher/ai.js'
import { isStaticPluginEnabled } from './controls.js'

export const RELEVANCE_PLUGIN_MANIFEST = Object.freeze({ id: 'omos.relevance', name: 'Relevance', version: '2.0.0', kind: 'bundled-first-party' })
const MAX_ATTEMPTS = 5
const LEASE_MS = 120_000
const MAX_BACKOFF_MS = 30 * 60 * 1000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export interface RelevanceJob {
  id: number
  article_id: number
  content_hash: string
  brief_hash: string
  brief_revision: number
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'dead' | 'superseded'
  attempts: number
  available_at: number
  lease_token: string | null
  lease_expires_at: number | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface ArticleRelevance {
  score: number
  reason: string
  content_hash: string
  brief_hash: string
  brief_revision: number
  created_at: string
  updated_at: string
}

export interface RelevanceBrief {
  brief: string | null
  revision: number
  configured: boolean
}

export function getRelevanceBrief(): RelevanceBrief {
  const row = getDb().prepare('SELECT brief, revision FROM relevance_config WHERE id = 1').get() as { brief: string | null; revision: number }
  const brief = row.brief?.trim() || null
  return { brief, revision: row.revision, configured: brief !== null }
}

export function setRelevanceBrief(value: string): number {
  const brief = value.trim()
  const current = getRelevanceBrief()
  if (brief === (current.brief ?? '')) return current.revision

  const revision = current.revision + 1
  const db = getDb()
  db.prepare("UPDATE relevance_config SET brief = ?, revision = ?, updated_at = datetime('now') WHERE id = 1").run(brief || null, revision)
  if (brief) {
    db.prepare('INSERT OR REPLACE INTO relevance_brief_revisions (revision, brief) VALUES (?, ?)').run(revision, brief)
    requeueRelevanceArticles()
  }
  return revision
}

export function enqueueRelevanceForArticle(articleId: number): number | null {
  const article = getDb().prepare('SELECT full_text FROM articles WHERE id = ?').get(articleId) as { full_text: string | null } | undefined
  const config = getRelevanceBrief()
  if (!article?.full_text?.trim() || !config.configured || !isStaticPluginEnabled('omos.relevance')) return null

  const contentHash = hash(article.full_text)
  const briefHash = hash(config.brief!)
  const db = getDb()
  db.prepare('INSERT INTO relevance_jobs (article_id, content_hash, brief_hash, brief_revision, available_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(article_id, content_hash, brief_hash, brief_revision) DO NOTHING').run(articleId, contentHash, briefHash, config.revision, Date.now())
  return (db.prepare('SELECT id FROM relevance_jobs WHERE article_id = ? AND content_hash = ? AND brief_hash = ? AND brief_revision = ?').get(articleId, contentHash, briefHash, config.revision) as { id: number }).id
}

function requeueRelevanceArticles(): void {
  if (!isStaticPluginEnabled('omos.relevance')) return
  const ids = getDb().prepare("SELECT id FROM articles WHERE purged_at IS NULL AND length(trim(COALESCE(full_text, ''))) > 0").all() as { id: number }[]
  for (const { id } of ids) enqueueRelevanceForArticle(id)
}

export function getRelevanceJob(articleId: number): RelevanceJob | undefined {
  return getDb().prepare('SELECT * FROM relevance_jobs WHERE article_id = ? ORDER BY id DESC LIMIT 1').get(articleId) as RelevanceJob | undefined
}

export function getArticleRelevance(articleId: number): ArticleRelevance | null {
  const config = getRelevanceBrief()
  if (!config.configured) return null
  const row = getDb().prepare('SELECT score, reason, content_hash, brief_hash, brief_revision, created_at, updated_at FROM article_relevance WHERE article_id = ?').get(articleId) as ArticleRelevance | undefined
  if (!row || row.brief_revision !== config.revision || row.brief_hash !== hash(config.brief!)) return null
  return row
}

function validateRelevance(value: unknown): { score: number; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relevance result')
  const result = value as Record<string, unknown>
  if (Object.keys(result).length !== 2 || !Object.hasOwn(result, 'score') || !Object.hasOwn(result, 'reason')) throw new Error('Invalid relevance result')
  const score = result.score
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) throw new Error('Invalid relevance score')
  if (typeof result.reason !== 'string' || !result.reason.trim() || result.reason.trim().length > 280) throw new Error('Invalid relevance reason')
  return { score, reason: result.reason.trim() }
}

function retryAt(attempts: number, now: number, random: () => number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempts - 1)))
  return now + base + Math.floor(random() * Math.min(base * 0.25, 30_000))
}

function recoverExpired(now: number): void {
  const db = getDb()
  const rows = db.prepare("SELECT id, attempts FROM relevance_jobs WHERE status = 'running' AND lease_expires_at <= ?").all(now) as Array<{ id: number; attempts: number }>
  for (const row of rows) {
    const dead = row.attempts >= MAX_ATTEMPTS
    db.prepare(`UPDATE relevance_jobs SET status = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL WHERE id = ?`).run(dead ? 'dead' : 'failed', dead ? now : retryAt(row.attempts, now, () => 0), row.id)
  }
}

function supersede(job: RelevanceJob): void {
  getDb().prepare("UPDATE relevance_jobs SET status = 'superseded', error = 'Stale relevance input', completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token)
}

function currentArticle(job: RelevanceJob): { full_text: string; title: string; feed_name: string; url: string } | null {
  const config = getRelevanceBrief()
  if (!config.configured || config.revision !== job.brief_revision || hash(config.brief!) !== job.brief_hash) return null
  const article = getDb().prepare('SELECT a.full_text, a.title, a.url, f.name AS feed_name FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE a.id = ?').get(job.article_id) as { full_text: string | null; title: string; feed_name: string; url: string } | undefined
  if (!article?.full_text?.trim() || hash(article.full_text) !== job.content_hash) return null
  return article as { full_text: string; title: string; feed_name: string; url: string }
}

export async function runRelevanceJobs(options: { batchSize?: number; concurrency?: number; now?: number; random?: () => number } = {}): Promise<number> {
  if (!isStaticPluginEnabled('omos.relevance')) return 0
  const now = options.now ?? Date.now()
  const random = options.random ?? Math.random
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10))
  const concurrency = Math.max(1, Math.min(batchSize, options.concurrency ?? 2))
  const db = getDb()
  recoverExpired(now)
  const jobs = db.prepare("SELECT * FROM relevance_jobs WHERE status IN ('pending', 'failed') AND available_at <= ? ORDER BY available_at, id LIMIT ?").all(now, batchSize) as RelevanceJob[]
  for (const job of jobs) {
    const token = randomUUID()
    if (db.prepare("UPDATE relevance_jobs SET status = 'running', attempts = attempts + 1, lease_token = ?, lease_expires_at = ? WHERE id = ? AND status IN ('pending', 'failed')").run(token, now + LEASE_MS, job.id).changes === 1) {
      job.lease_token = token
      job.attempts += 1
    }
  }

  let next = 0
  let completed = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      if (!job.lease_token || !isStaticPluginEnabled('omos.relevance')) continue
      const article = currentArticle(job)
      if (!article) {
        supersede(job)
        continue
      }
      try {
        const result = validateRelevance(await assessArticleRelevance(article.full_text, getRelevanceBrief().brief!, { title: article.title, feedName: article.feed_name, url: article.url }))
        if (!currentArticle(job)) {
          supersede(job)
          continue
        }
        db.prepare("INSERT INTO article_relevance (article_id, score, reason, content_hash, brief_hash, brief_revision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(article_id) DO UPDATE SET score = excluded.score, reason = excluded.reason, content_hash = excluded.content_hash, brief_hash = excluded.brief_hash, brief_revision = excluded.brief_revision, updated_at = datetime('now')").run(job.article_id, result.score, result.reason, job.content_hash, job.brief_hash, job.brief_revision)
        if (db.prepare("UPDATE relevance_jobs SET status = 'succeeded', error = NULL, completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token).changes === 1) completed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Relevance assessment failed'
        const dead = job.attempts >= MAX_ATTEMPTS
        db.prepare(`UPDATE relevance_jobs SET status = ?, error = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'NULL'}, lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?`).run(dead ? 'dead' : 'failed', message, dead ? now : retryAt(job.attempts, now, random), job.id, job.lease_token)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return completed
}
