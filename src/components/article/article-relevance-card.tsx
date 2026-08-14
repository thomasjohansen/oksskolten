import { Sparkles } from 'lucide-react'
import { Callout } from '../ui/callout'
import { useI18n } from '../../lib/i18n'

export function ArticleRelevanceCard({ score, reason }: { score: number; reason: string }) {
  const { t } = useI18n()
  return (
    <Callout>
      <div className="flex items-start gap-3">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">{t('plugins.relevance.title')} {score}/100</p>
          <p className="mt-1 text-sm text-muted">{reason}</p>
        </div>
      </div>
    </Callout>
  )
}
