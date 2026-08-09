import { Sparkles } from 'lucide-react'
import { Callout } from '../ui/callout'

export function ArticleRelevanceCard({ score, reason }: { score: number; reason: string }) {
  return (
    <Callout>
      <div className="flex items-start gap-3">
        <Sparkles size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Relevance {score}/100</p>
          <p className="text-sm text-muted mt-1">{reason}</p>
        </div>
      </div>
    </Callout>
  )
}
