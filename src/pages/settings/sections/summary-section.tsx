import useSWR from 'swr'
import { useI18n } from '../../../lib/i18n'
import { fetcher } from '../../../lib/fetcher'
import { PluginToggle, type PluginHealth } from './plugin-control'

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
      {!data.enabled && <p className="mt-3 text-xs text-muted">{t('plugins.disabledDesc')}</p>}
    </section>
  )
}
