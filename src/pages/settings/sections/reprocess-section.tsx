import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { apiPost, fetcher } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'

const modules = ['summary', 'relevance', 'ai_labels'] as const
type ModuleName = typeof modules[number]

interface ModuleCounters {
  total: number
  pending: number
  running: number
  succeeded: number
  failed: number
  skipped: number
}

interface ReprocessStatus {
  run_id: string
  status: 'running' | 'succeeded' | 'failed'
  modules: Record<ModuleName, ModuleCounters>
}

interface ReprocessStartResponse { run_id: string }

const emptyCounters = (): ModuleCounters => ({ total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, skipped: 0 })

function totals(status: ReprocessStatus | null) {
  return modules.reduce((result, module) => {
    const counters = status?.modules[module] || emptyCounters()
    result.total += counters.total
    result.completed += counters.succeeded + counters.failed + counters.skipped
    return result
  }, { total: 0, completed: 0 })
}

export function ReprocessSection() {
  const { t } = useI18n()
  const [runId, setRunId] = useState<string | null>(null)
  const [status, setStatus] = useState<ReprocessStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!runId || status?.status !== 'running') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const next = await fetcher(`/api/internal/reprocess/${runId}`) as ReprocessStatus
        if (cancelled) return
        setStatus(next)
        if (next.status === 'running') timer = setTimeout(() => void poll(), 1000)
      } catch {
        if (!cancelled) {
          setError(true)
          setRunId(null)
          setStatus(null)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [runId, status?.status])

  async function analyzeExisting() {
    if (starting || status?.status === 'running') return
    setStarting(true)
    setStatus(null)
    setRunId(null)
    setError(false)
    try {
      const response = await apiPost('/api/internal/reprocess', {
        modules,
        limit: 50,
      }) as ReprocessStartResponse
      setRunId(response.run_id)
      setStatus({ run_id: response.run_id, status: 'running', modules: Object.fromEntries(modules.map(module => [module, emptyCounters()])) as Record<ModuleName, ModuleCounters> })
    } catch {
      setError(true)
    } finally {
      setStarting(false)
    }
  }

  const progress = totals(status)
  const isActive = starting || status?.status === 'running'
  const isComplete = status?.status === 'succeeded' || status?.status === 'failed'

  return (
    <section aria-labelledby="reprocess-title" className="rounded-xl border border-border bg-bg-subtle/30 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="reprocess-title" className="mb-1 text-base font-semibold text-text">{t('plugins.reprocess.title')}</h2>
          <p className="max-w-2xl text-xs text-muted">{t('plugins.reprocess.desc')}</p>
        </div>
        <button
          type="button"
          onClick={() => void analyzeExisting()}
          disabled={isActive}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isActive && <LoaderCircle size={14} className="animate-spin" />}
          {isActive ? t('plugins.reprocess.working') : t('plugins.reprocess.action')}
        </button>
      </div>

      {status && (
        <div role="status" className="mt-4 border-t border-border/60 pt-3 text-xs">
          <div className="flex items-center gap-2 text-text">
            {isActive ? <LoaderCircle size={14} className="animate-spin text-accent" /> : status.status === 'succeeded' ? <CheckCircle2 size={14} className="text-accent" /> : <XCircle size={14} className="text-error" />}
            <span className="font-medium">{isComplete ? t(status.status === 'succeeded' ? 'plugins.reprocess.complete' : 'plugins.reprocess.failed') : t('plugins.reprocess.progress')}</span>
            <span className="ml-auto tabular-nums text-muted">{progress.completed} / {progress.total}</span>
            {isComplete && <button type="button" onClick={() => { setRunId(null); setStatus(null) }} className="ml-2 text-muted transition-colors hover:text-text" aria-label={t('plugins.reprocess.dismiss')}>×</button>}
          </div>
          {isComplete && (
            <p className="mt-1 text-muted">
              {t('plugins.reprocess.failedExplained', { count: String(modules.reduce((sum, module) => sum + status.modules[module].failed, 0)) })} {t('plugins.reprocess.skippedExplained', { count: String(modules.reduce((sum, module) => sum + status.modules[module].skipped, 0)) })}
            </p>
          )}
          <ul className="mt-2 grid gap-1 sm:grid-cols-3">
            {modules.map(module => {
              const counters = status.modules[module]
              return <li key={module} className="flex justify-between gap-2 text-muted"><span className="font-medium text-text">{t(module === 'ai_labels' ? 'plugins.aiLabels.title' : `plugins.${module}.title` as 'plugins.summary.title')}</span><span>{t('plugins.reprocess.moduleResult', { succeeded: String(counters.succeeded), failed: String(counters.failed), skipped: String(counters.skipped) })}</span></li>
            })}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-error"><XCircle size={14} /> {t('plugins.reprocess.error')}</p>}
    </section>
  )
}
