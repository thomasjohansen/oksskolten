import type { ReactNode } from 'react'
import useSWR from 'swr'
import { CheckCircle2, Clock3, LoaderCircle, XCircle } from 'lucide-react'
import { fetcher } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'

type SummaryJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead' | 'superseded'
interface SummaryJob { status: SummaryJobStatus }
interface SummaryJobsResponse { jobs: SummaryJob[] }

export interface SummaryHealth { pending: number; running: number; failed: number; succeeded: number }

export function getSummaryHealth(jobs: SummaryJob[]): SummaryHealth {
  return jobs.reduce<SummaryHealth>((health, job) => {
    if (job.status === 'pending') health.pending++
    else if (job.status === 'running') health.running++
    else if (job.status === 'failed' || job.status === 'dead') health.failed++
    else if (job.status === 'succeeded') health.succeeded++
    return health
  }, { pending: 0, running: 0, failed: 0, succeeded: 0 })
}

export function SummarySection() {
  const { t } = useI18n()
  const { data, error } = useSWR<SummaryJobsResponse>('/api/internal/summary/jobs?limit=50', fetcher, { refreshInterval: 30_000 })
  const health = getSummaryHealth(data?.jobs ?? [])
  const active = health.pending + health.running

  return (
    <section aria-labelledby="summary-plugin-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="summary-plugin-title" className="text-base font-semibold text-text mb-1">{t('plugins.summary.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.summary.desc')}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] text-muted">{t('plugins.bundled')}</span>
      </div>
      <div className="mt-5 rounded-lg bg-hover/60 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          {error ? <XCircle size={15} className="text-error" /> : active > 0 ? <LoaderCircle size={15} className="text-accent animate-spin" /> : <CheckCircle2 size={15} className="text-accent" />}
          <span>{error ? t('plugins.summary.statusUnavailable') : !data ? t('plugins.summary.statusChecking') : active > 0 ? t('plugins.summary.statusActive') : health.failed > 0 ? t('plugins.summary.statusNeedsAttention') : t('plugins.summary.statusHealthy')}</span>
        </div>
        {data && !error && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
            <StatusCount icon={<Clock3 size={13} />} label={t('plugins.summary.queued')} value={health.pending} />
            <StatusCount icon={<LoaderCircle size={13} />} label={t('plugins.summary.running')} value={health.running} />
            <StatusCount icon={<XCircle size={13} />} label={t('plugins.summary.failed')} value={health.failed} />
            <StatusCount icon={<CheckCircle2 size={13} />} label={t('plugins.summary.completed')} value={health.succeeded} />
          </div>
        )}
      </div>
    </section>
  )
}

function StatusCount({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="flex items-center gap-1.5"><span className="text-muted/70">{icon}</span><span>{label}: {value}</span></div>
}
