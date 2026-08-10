import useSWR from 'swr'
import { apiPatch, fetcher } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'
import { PluginToggle, type PluginHealth } from './plugin-control'

interface AiLabelsHealth extends PluginHealth { allow_new_labels: boolean }

export function AiLabelsSection() {
  const { t } = useI18n()
  const { data, mutate } = useSWR<AiLabelsHealth>('/api/settings/plugins/ai-labels', fetcher)
  if (!data) return null

  async function setAllowNewLabels(allow: boolean) {
    const next = await apiPatch('/api/settings/plugins/ai-labels/config', { allow_new_labels: allow }) as AiLabelsHealth
    await mutate(next, { revalidate: false })
  }

  return (
    <section aria-labelledby="ai-labels-plugin-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="ai-labels-plugin-title" className="text-base font-semibold text-text mb-1">{t('plugins.aiLabels.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.aiLabels.desc')}</p>
        </div>
        <PluginToggle health={data} onChange={next => void mutate({ ...data, ...next }, { revalidate: false })} />
      </div>
      {!data.enabled && <p className="mt-3 text-xs text-muted">{t('plugins.disabledDesc')}</p>}
      <label className="mt-4 flex items-center justify-between gap-4 text-sm text-text">
        <span>
          {t('plugins.aiLabels.allowNew')}
          <span className="block text-xs text-muted mt-0.5">{t('plugins.aiLabels.allowNewDesc')}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={data.allow_new_labels}
          aria-label={t('plugins.aiLabels.allowNew')}
          onClick={() => void setAllowNewLabels(!data.allow_new_labels)}
          disabled={!data.enabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${data.allow_new_labels ? 'bg-accent' : 'bg-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${data.allow_new_labels ? 'translate-x-5' : ''}`} />
        </button>
      </label>
    </section>
  )
}
