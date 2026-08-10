import { Link } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'

export interface EffectiveArticleLabel {
  id: number
  name: string
  origin: 'user' | 'ai'
  ai_confidence?: number | null
  ai_provenance?: string | null
}

export function ArticleLabels({ labels }: { labels: EffectiveArticleLabel[] }) {
  const { t } = useI18n()
  if (labels.length === 0) return null
  return (
    <div className="mb-4 flex items-start gap-2 text-xs text-muted">
      <span className="shrink-0 pt-1">{t('article.labels')}</span>
      <div className="flex flex-wrap gap-1.5">
        {labels.map(label => (
          <Link
            key={label.id}
            to={`/labels/${label.id}`}
            title={label.origin === 'ai' ? t('article.aiLabel') : undefined}
            className="rounded-full border border-border bg-hover px-2 py-0.5 text-[11px] text-text no-underline transition-colors hover:border-accent hover:text-accent"
          >
            {label.name}
          </Link>
        ))}
      </div>
    </div>
  )
}
