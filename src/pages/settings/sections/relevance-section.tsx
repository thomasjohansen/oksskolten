import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { apiPut, fetcher } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'
import { PluginToggle, type PluginHealth } from './plugin-control'

interface RelevanceBriefResponse {
  brief: string | null
  revision: number
}

export function RelevanceSection() {
  const { t } = useI18n()
  const { data: briefData, mutate: mutateBrief } = useSWR<RelevanceBriefResponse>('/api/settings/relevance', fetcher)
  const { data: healthData, mutate: mutateHealth } = useSWR<PluginHealth>('/api/settings/plugins/relevance', fetcher)
  const [brief, setBrief] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    if (briefData) setBrief(briefData.brief ?? '')
  }, [briefData])

  if (!briefData || !healthData) return null

  const persistedBrief = briefData.brief ?? ''
  const dirty = brief !== persistedBrief
  const canSave = dirty && healthData.enabled && !saving

  async function save() {
    setSaving(true)
    setFeedback(null)
    try {
      const next = await apiPut('/api/settings/relevance', { brief }) as RelevanceBriefResponse
      await mutateBrief(next, { revalidate: false })
      setBrief(next.brief ?? '')
      setFeedback('saved')
    } catch {
      setFeedback('error')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(next: PluginHealth) {
    await mutateHealth(next, { revalidate: false })
  }

  return (
    <section aria-labelledby="relevance-plugin-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="relevance-plugin-title" className="mb-1 text-base font-semibold text-text">{t('plugins.relevance.title')}</h2>
          <p className="max-w-2xl text-xs text-muted">{t('plugins.relevance.desc')}</p>
        </div>
        <PluginToggle health={healthData} onChange={next => void toggle(next)} />
      </div>

      <div className="mt-5 max-w-2xl rounded-xl border border-border/70 bg-surface/40 p-4 shadow-sm">
        <label htmlFor="relevance-brief" className="text-sm font-medium text-text">{t('plugins.relevance.briefLabel')}</label>
        <p id="relevance-brief-help" className="mt-1 text-xs leading-5 text-muted">{t('plugins.relevance.briefHelp')}</p>
        <textarea
          id="relevance-brief"
          value={brief}
          onChange={event => { setBrief(event.target.value); setFeedback(null) }}
          disabled={!healthData.enabled || saving}
          aria-describedby="relevance-brief-help"
          placeholder={t('plugins.relevance.placeholder')}
          rows={5}
          className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-6 text-text outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-55"
        />
        {!healthData.enabled && <p className="mt-3 text-xs leading-5 text-muted">{t('plugins.relevance.disabledBrief')}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {feedback && (
            <span role="status" className={`text-xs ${feedback === 'error' ? 'text-error' : 'text-accent'}`}>
              {t(feedback === 'error' ? 'plugins.relevance.error' : 'plugins.relevance.saved')}
            </span>
          )}
          <button type="button" onClick={() => void save()} disabled={!canSave} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? t('plugins.relevance.saving') : t('plugins.relevance.save')}
          </button>
        </div>
      </div>
    </section>
  )
}
