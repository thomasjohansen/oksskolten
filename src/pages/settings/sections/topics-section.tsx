import useSWR from 'swr'
import { fetcher } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'
import { PluginToggle, type PluginHealth } from './plugin-control'

export function TopicsSection() {
  const { t } = useI18n()
  const { data, mutate } = useSWR<PluginHealth>('/api/settings/plugins/topics', fetcher)
  if (!data) return null
  return (
    <section aria-labelledby="topics-plugin-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="topics-plugin-title" className="text-base font-semibold text-text mb-1">{t('plugins.topics.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.topics.desc')}</p>
        </div>
        <PluginToggle health={data} onChange={next => void mutate(next, { revalidate: false })} />
      </div>
      {!data.enabled && <p className="mt-3 text-xs text-muted">{t('plugins.disabledDesc')}</p>}
    </section>
  )
}
