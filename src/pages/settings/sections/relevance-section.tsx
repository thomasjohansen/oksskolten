import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { apiPut, fetcher } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'
import { PluginToggle, type PluginHealth } from './plugin-control'

export const SIGNAL_KEYS = ['evidence_credibility', 'public_significance', 'information_value', 'constructive_positive_impact', 'clickbait_penalty', 'paywall_penalty', 'distressing_conflict_war_penalty'] as const
type SignalKey = typeof SIGNAL_KEYS[number]
type Weights = Record<SignalKey, number>
interface Profile { version: 1; name: 'Balanced'; weights: Weights }
interface ProfileResponse { profile: Profile; revision: number; configured: boolean; enabled: boolean }

export function updateRelevanceWeight(weights: Weights, key: SignalKey, value: number): Weights {
  const nextValue = Math.max(0, Math.min(1, value))
  const others = SIGNAL_KEYS.filter(signal => signal !== key)
  const remainder = 1 - nextValue
  const otherTotal = others.reduce((sum, signal) => sum + weights[signal], 0)
  return Object.fromEntries(SIGNAL_KEYS.map(signal => [signal, signal === key ? nextValue : remainder * (otherTotal ? weights[signal] / otherTotal : 1 / others.length)])) as Weights
}

const SIGNAL_LABELS = {
  evidence_credibility: 'plugins.relevance.evidence',
  public_significance: 'plugins.relevance.significance',
  information_value: 'plugins.relevance.information',
  constructive_positive_impact: 'plugins.relevance.constructive',
  clickbait_penalty: 'plugins.relevance.clickbait',
  paywall_penalty: 'plugins.relevance.paywall',
  distressing_conflict_war_penalty: 'plugins.relevance.distress',
} as const

const SIGNAL_DESC_LABELS = {
  evidence_credibility: 'plugins.relevance.evidenceDesc',
  public_significance: 'plugins.relevance.significanceDesc',
  information_value: 'plugins.relevance.informationDesc',
  constructive_positive_impact: 'plugins.relevance.constructiveDesc',
  clickbait_penalty: 'plugins.relevance.clickbaitDesc',
  paywall_penalty: 'plugins.relevance.paywallDesc',
  distressing_conflict_war_penalty: 'plugins.relevance.distressDesc',
} as const

export function RelevanceSection() {
  const { t } = useI18n()
  const { data: profileData, mutate: mutateProfile } = useSWR<ProfileResponse>('/api/settings/plugins/relevance/profile', fetcher)
  const { data: healthData, mutate: mutateHealth } = useSWR<PluginHealth>('/api/settings/plugins/relevance', fetcher)
  const [weights, setWeights] = useState<Weights | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => { if (profileData) setWeights(profileData.profile.weights) }, [profileData])
  if (!profileData || !healthData || !weights) return null

  const dirty = JSON.stringify(weights) !== JSON.stringify(profileData.profile.weights)
  async function save() {
    setSaving(true); setFeedback(null)
    try {
      const next = await apiPut('/api/settings/plugins/relevance/profile', { profile: { version: 1, name: 'Balanced', weights } }) as ProfileResponse
      await mutateProfile(next, { revalidate: false }); setFeedback(t('plugins.relevance.saved'))
    } catch { setFeedback(t('plugins.relevance.error')) }
    finally { setSaving(false) }
  }
  async function toggle(next: PluginHealth) {
    await mutateHealth(next, { revalidate: false })
  }

  return (
    <section aria-labelledby="relevance-plugin-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="relevance-plugin-title" className="text-base font-semibold text-text mb-1">{t('plugins.relevance.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.relevance.profileDesc')}</p>
        </div>
        <PluginToggle health={healthData} onChange={next => void toggle(next)} />
      </div>
      {!healthData.enabled && <p className="mt-3 text-xs text-muted">{t('plugins.disabledDesc')}</p>}
      <p className="mt-4 text-xs text-muted">{t('plugins.relevance.rankingNote')}</p>
      <div className="mt-4 space-y-4">
        {SIGNAL_KEYS.map(key => (
          <label key={key} className="block">
            <div className="flex items-center justify-between gap-3 text-sm text-text">
              <span>{t(SIGNAL_LABELS[key])}</span><span className="text-xs text-muted tabular-nums">{Math.round(weights[key] * 100)}%</span>
            </div>
            <input aria-label={t(SIGNAL_LABELS[key])} type="range" min="0" max="100" value={Math.round(weights[key] * 100)} onChange={event => setWeights(updateRelevanceWeight(weights, key, Number(event.target.value) / 100))} disabled={!healthData.enabled || saving} className="mt-1 w-full accent-accent" />
            <p className="text-[11px] text-muted">{t(SIGNAL_DESC_LABELS[key])}</p>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {feedback && <span role="status" className={`text-xs ${feedback === t('plugins.relevance.error') ? 'text-error' : 'text-accent'}`}>{feedback}</span>}
        <button type="button" onClick={() => void save()} disabled={!dirty || !healthData.enabled || saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:opacity-90 disabled:opacity-50">{saving ? t('plugins.relevance.saving') : t('plugins.relevance.save')}</button>
      </div>
    </section>
  )
}
