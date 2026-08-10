import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../db/connection.js'
import { extractAiLabels } from '../fetcher/ai.js'
import { isStaticPluginEnabled } from './controls.js'

export const AI_LABELS_PLUGIN_MANIFEST = Object.freeze({ id: 'omos.ai-labels', name: 'AI Labels', version: '1.0.0', kind: 'bundled-first-party' })
const MAX_ATTEMPTS = 5
const MIN_CONFIDENCE = 0.7
const MIN_NOVEL_CONFIDENCE = 0.9
const LEASE_MS = 120_000
const MAX_BACKOFF = 30 * 60 * 1000
export interface AiLabelJob { id: number; article_id: number; content_hash: string; status: string; attempts: number; available_at: number; lease_token: string | null; lease_expires_at: number | null; error: string | null }
export interface AiLabelCandidate { name: string; confidence: number; label_id?: number; justification?: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export function normalizeLabelName(name: string): string { return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() }
export function validateAiLabels(value: unknown): AiLabelCandidate[] {
  if (!Array.isArray(value)) throw new Error('AI labels must be an array')
  const result = value.map(item => {
    const candidate = item as { name?: unknown; confidence?: unknown; label_id?: unknown; justification?: unknown }
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    if (!name || name.length > 50 || name.split(/\s+/).length > 4 || /https?:\/\//i.test(name) || /[{}()[\]_=<>]|=>|\\|::/.test(name) || typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) throw new Error('Invalid AI label candidate')
    const labelId = typeof candidate.label_id === 'number' ? candidate.label_id : undefined
    const justification = typeof candidate.justification === 'string' ? candidate.justification.trim() : undefined
    if (labelId !== undefined && (!Number.isInteger(labelId) || labelId <= 0)) throw new Error('Invalid AI label candidate')
    return { name, confidence: candidate.confidence, ...(labelId === undefined ? {} : { label_id: labelId }), ...(justification ? { justification } : {}) }
  })
  if (new Set(result.map(item => normalizeLabelName(item.name))).size !== result.length) throw new Error('Duplicate AI labels')
  return result
}

export function enqueueAiLabelsForArticle(articleId: number): number | null {
  const row = getDb().prepare('SELECT full_text FROM articles WHERE id = ?').get(articleId) as { full_text: string | null } | undefined
  if (!row?.full_text?.trim() || !isStaticPluginEnabled('omos.ai-labels')) return null
  const contentHash = hash(row.full_text); const db = getDb()
  db.prepare('INSERT INTO ai_label_jobs (article_id, content_hash, available_at) VALUES (?, ?, ?) ON CONFLICT(article_id, content_hash) DO NOTHING').run(articleId, contentHash, Date.now())
  return (db.prepare('SELECT id FROM ai_label_jobs WHERE article_id = ? AND content_hash = ?').get(articleId, contentHash) as { id: number }).id
}
export function getAiLabelJob(articleId: number): AiLabelJob | undefined { return getDb().prepare('SELECT * FROM ai_label_jobs WHERE article_id = ? ORDER BY id DESC LIMIT 1').get(articleId) as AiLabelJob | undefined }
function retryAt(attempts: number, now: number): number { return now + Math.min(MAX_BACKOFF, 1_000 * (2 ** Math.max(0, attempts - 1))) }
function findOrCreateLabel(name: string): number {
  const normalized = normalizeLabelName(name); const db = getDb()
  const existing = db.prepare('SELECT id FROM labels WHERE normalized_name = ?').get(normalized) as { id: number } | undefined
  if (existing) return existing.id
  const config = db.prepare("SELECT enabled, allow_new_labels FROM static_plugin_config WHERE plugin_id = 'omos.ai-labels'").get() as { enabled: number; allow_new_labels: number }
  if (!config.enabled || !config.allow_new_labels) return 0
  const info = db.prepare("INSERT INTO labels (name, match_text, match_field, sort_order, auto_summarize, exclusive, origin, lifecycle_status, normalized_name) VALUES (?, '', 'both', (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM labels), 0, 0, 'ai', 'candidate', ?)").run(name, normalized)
  return Number(info.lastInsertRowid)
}

const GENERIC_NOVEL_LABELS = new Set(['news', 'article', 'topic', 'general', 'other', 'information', 'misc', 'miscellaneous'])
function isUsableNovelCandidate(candidate: AiLabelCandidate): boolean {
  return candidate.confidence >= MIN_NOVEL_CONFIDENCE && !GENERIC_NOVEL_LABELS.has(normalizeLabelName(candidate.name)) && Boolean(candidate.justification && candidate.justification.length >= 20)
}

function promoteEligibleAiLabels(): void {
  getDb().prepare(`
    UPDATE labels
    SET lifecycle_status = 'promoted'
    WHERE origin = 'ai' AND lifecycle_status = 'candidate'
      AND id IN (
        SELECT label_id
        FROM article_ai_labels
        GROUP BY label_id
        HAVING COUNT(DISTINCT article_id) >= 3
           AND COUNT(DISTINCT CASE WHEN confidence >= 0.8 THEN article_id END) >= 2
      )
  `).run()
}

export async function runAiLabelJobs(options: { batchSize?: number; now?: number } = {}): Promise<number> {
  if (!isStaticPluginEnabled('omos.ai-labels')) return 0
  const now = options.now ?? Date.now(); const db = getDb()
  const jobs = db.prepare("SELECT * FROM ai_label_jobs WHERE status IN ('pending', 'failed') AND available_at <= ? ORDER BY available_at, id LIMIT ?").all(now, Math.min(20, options.batchSize ?? 10)) as AiLabelJob[]
  for (const job of jobs) {
    const token = randomUUID(); db.prepare("UPDATE ai_label_jobs SET status = 'running', attempts = attempts + 1, lease_token = ?, lease_expires_at = ? WHERE id = ? AND status IN ('pending', 'failed')").run(token, now + LEASE_MS, job.id); job.lease_token = token
    try {
      if (!isStaticPluginEnabled('omos.ai-labels')) { db.prepare("UPDATE ai_label_jobs SET status = 'superseded', error = 'Plugin disabled', completed_at = datetime('now'), lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token); continue }
      const article = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
      if (!article?.full_text?.trim() || hash(article.full_text) !== job.content_hash) throw new Error('Stale AI label input')
      const availableLabels = db.prepare('SELECT id, name FROM labels ORDER BY id').all() as { id: number; name: string }[]
      const candidates = validateAiLabels(await extractAiLabels(article.full_text, availableLabels))
      const current = db.prepare('SELECT full_text FROM articles WHERE id = ?').get(job.article_id) as { full_text: string | null } | undefined
      if (!current?.full_text?.trim() || hash(current.full_text) !== job.content_hash) throw new Error('Stale AI label input')
      db.transaction(() => {
        db.prepare('DELETE FROM article_ai_labels WHERE article_id = ?').run(job.article_id)
        const insert = db.prepare("INSERT OR REPLACE INTO article_ai_labels (article_id, label_id, confidence, source_content_hash, provenance) VALUES (?, ?, ?, ?, 'omos.ai-labels')")
        const existingByName = new Map(availableLabels.map(label => [normalizeLabelName(label.name), label]))
        const selected: AiLabelCandidate[] = []
        for (const candidate of candidates) {
          const existing = existingByName.get(normalizeLabelName(candidate.name))
          if (existing && candidate.confidence >= MIN_CONFIDENCE && (!candidate.label_id || candidate.label_id === existing.id)) selected.push({ ...candidate, name: existing.name, label_id: existing.id })
        }
        if (selected.length < 3) {
          const novel = candidates.find(candidate => !existingByName.has(normalizeLabelName(candidate.name)) && !candidate.label_id && isUsableNovelCandidate(candidate))
          if (novel) selected.push(novel)
        }
        for (const candidate of selected.slice(0, 3)) { const labelId = candidate.label_id ?? findOrCreateLabel(candidate.name); if (labelId) insert.run(job.article_id, labelId, candidate.confidence, job.content_hash) }
        promoteEligibleAiLabels()
        db.prepare("UPDATE ai_label_jobs SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, completed_at = datetime('now') WHERE id = ? AND lease_token = ?").run(job.id, job.lease_token)
      })()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error); const attempts = (db.prepare('SELECT attempts FROM ai_label_jobs WHERE id = ?').get(job.id) as { attempts: number }).attempts; const dead = attempts >= MAX_ATTEMPTS
      db.prepare(`UPDATE ai_label_jobs SET status = ?, error = ?, available_at = ?, completed_at = ${dead ? "datetime('now')" : 'completed_at'}, lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?`).run(message === 'Stale AI label input' ? 'superseded' : dead ? 'dead' : 'failed', message, dead ? now : retryAt(attempts, now), job.id, job.lease_token)
      if (message === 'Stale AI label input') enqueueAiLabelsForArticle(job.article_id)
    }
  }
  return jobs.length
}
