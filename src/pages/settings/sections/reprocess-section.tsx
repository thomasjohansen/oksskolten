import { useState } from 'react'
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { apiPost } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'

interface ModuleResult { queued: number; skipped: number }
interface ReprocessResponse {
  selected: number
  modules: { summary: ModuleResult; relevance: ModuleResult; topics: ModuleResult }
}

export function ReprocessSection() {
  const { t } = useI18n()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ReprocessResponse | null>(null)
  const [error, setError] = useState(false)

  async function analyzeExisting() {
    if (running) return
    setRunning(true)
    setResult(null)
    setError(false)
    try {
      setResult(await apiPost('/api/internal/reprocess', { modules: ['summary', 'relevance', 'topics'], limit: 50 }) as ReprocessResponse)
    } catch {
      setError(true)
    } finally {
      setRunning(false)
    }
  }

  const queued = result ? result.modules.summary.queued + result.modules.relevance.queued + result.modules.topics.queued : 0
  const skipped = result ? result.modules.summary.skipped + result.modules.relevance.skipped + result.modules.topics.skipped : 0

  return (
    <section aria-labelledby="reprocess-title" className="rounded-xl border border-border bg-bg-subtle/30 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="reprocess-title" className="text-base font-semibold text-text mb-1">{t('plugins.reprocess.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.reprocess.desc')}</p>
        </div>
        <button
          type="button"
          onClick={() => void analyzeExisting()}
          disabled={running}
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running && <LoaderCircle size={14} className="animate-spin" />}
          {running ? t('plugins.reprocess.working') : t('plugins.reprocess.action')}
        </button>
      </div>
      {result && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-xs text-accent">
          <CheckCircle2 size={14} />
          {t('plugins.reprocess.result').replace('{queued}', String(queued)).replace('{skipped}', String(skipped)).replace('{selected}', String(result.selected))}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-error">
          <XCircle size={14} /> {t('plugins.reprocess.error')}
        </p>
      )}
    </section>
  )
}
