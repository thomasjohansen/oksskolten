import { Sparkles } from 'lucide-react'
import { Callout } from '../ui/callout'
import { useI18n } from '../../lib/i18n'

const SIGNAL_LABELS = [
  ['evidence_credibility', 'plugins.relevance.evidence'],
  ['public_significance', 'plugins.relevance.significance'],
  ['information_value', 'plugins.relevance.information'],
  ['constructive_positive_impact', 'plugins.relevance.constructive'],
  ['clickbait_penalty', 'plugins.relevance.clickbait'],
  ['paywall_penalty', 'plugins.relevance.paywall'],
  ['distressing_conflict_war_penalty', 'plugins.relevance.distress'],
] as const

export function ArticleRelevanceCard({ score, reason, signals }: { score: number; reason: string; signals?: Record<string, { value: number; reason: string }> }) {
  const { t } = useI18n()
  return (
    <Callout>
      <div className="flex items-start gap-3">
        <Sparkles size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">{t('plugins.relevance.title')} {score}/100</p>
          <p className="text-sm text-muted mt-1">{reason}</p>
          {signals && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer select-none text-accent hover:underline">{t('article.relevanceSignals')}</summary>
              <div className="mt-2 space-y-2">
                {SIGNAL_LABELS.map(([key, label]) => {
                  const signal = signals[key]
                  if (!signal) return null
                  return <div key={key}><div className="flex justify-between gap-3 text-text"><span>{t(label)}</span><span className="text-muted">{signal.value}/100</span></div><p className="mt-0.5 text-muted">{signal.reason}</p></div>
                })}
              </div>
            </details>
          )}
        </div>
      </div>
    </Callout>
  )
}
