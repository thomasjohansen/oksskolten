import { useI18n } from '../../lib/i18n'

interface ArticleTopicsProps {
  topics: string[]
}

export function ArticleTopics({ topics }: ArticleTopicsProps) {
  const { t } = useI18n()
  if (topics.length === 0) return null

  return (
    <div className="mb-4 flex items-start gap-2 text-xs text-muted">
      <span className="shrink-0 pt-1">{t('article.topics')}</span>
      <ul aria-label={t('article.topics')} className="flex flex-wrap gap-1.5">
        {topics.map(topic => (
          <li key={topic} className="rounded-full border border-border bg-hover px-2 py-0.5 text-[11px] text-text">
            {topic}
          </li>
        ))}
      </ul>
    </div>
  )
}
