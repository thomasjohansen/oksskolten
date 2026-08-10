import useSWR from 'swr'
import { useI18n } from '../../../lib/i18n'
import { fetcher } from '../../../lib/fetcher'
import { PluginHealthStatus, PluginToggle, type PluginHealth } from './plugin-control'

export interface SummaryHealth { pending: number; running: number; failed: number; succeeded: number }

export function getSummaryHealth(health: PluginHealth): SummaryHealth {
  return { pending: health.pending, running: health.running, failed: health.failed + health.dead, succeeded: health.succeeded }
}

export function SummarySection() {
  const { t } = useI18n()
  const { data, mutate } = useSWR<PluginHealth>('/api/settings/plugins/summary', fetcher)
  if (!data) return null
  return (
    <section aria-labelledby="summary-plugin-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="summary-plugin-title" className="text-base font-semibold text-text mb-1">{t('plugins.summary.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.summary.desc')}</p>
        </div>
        <PluginToggle health={data} onChange={next => void mutate(next, { revalidate: false })} />
      </div>
      <PluginHealthStatus health={data} />
    </section>
  )
}
