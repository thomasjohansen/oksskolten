import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiPut } from '../../../lib/fetcher'
import { Button } from '@/components/ui/button'
import { useI18n } from '../../../lib/i18n'

interface RelevanceConfig { brief: string | null; revision: number }

export function RelevanceSection() {
  const { t } = useI18n()
  const { data, mutate } = useSWR<RelevanceConfig>('/api/settings/relevance', fetcher)
  const [brief, setBrief] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (data) setBrief(data.brief ?? '')
  }, [data])

  const isDirty = data != null && brief !== (data.brief ?? '')
  const save = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const next = await apiPut('/api/settings/relevance', { brief }) as RelevanceConfig
      await mutate(next, { revalidate: false })
      setFeedback('Saved. New imports will use this brief; existing articles are not automatically rescored.')
    } catch {
      setFeedback('Could not save the relevance brief. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-1">{t('plugins.relevance.title')}</h2>
      <p className="text-xs text-muted mb-4 max-w-2xl">{t('plugins.relevance.desc')}</p>
      <label className="block text-sm font-medium text-text" htmlFor="relevance-brief">{t('plugins.relevance.briefLabel')}</label>
      <textarea
        id="relevance-brief"
        value={brief}
        onChange={event => { setBrief(event.target.value); setFeedback(null) }}
        rows={4}
        placeholder={t('plugins.relevance.placeholder')}
        className="mt-1 w-full rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-text placeholder:text-muted/60 resize-y focus:outline-none focus:ring-1 focus:ring-accent"
        disabled={saving}
      />
      {!data?.brief && <p className="text-xs text-muted mt-2">{t('plugins.relevance.empty')}</p>}
      <div className="flex items-center justify-end gap-3 mt-3">
        {feedback && <span role="status" className={`text-xs ${feedback.startsWith('Could not') ? 'text-error' : 'text-accent'}`}>{feedback}</span>}
        <Button size="sm" onClick={() => void save()} disabled={!isDirty || saving}>{saving ? t('plugins.relevance.saving') : t('plugins.relevance.save')}</Button>
      </div>
    </section>
  )
}
