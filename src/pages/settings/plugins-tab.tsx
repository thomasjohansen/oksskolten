import { ImageStorageSettings } from '../../components/settings/image-storage-settings'
import { RelevanceSection } from './sections/relevance-section'
import { SummarySection } from './sections/summary-section'
import { ReprocessSection } from './sections/reprocess-section'
import { TopicsSection } from './sections/topics-section'
import { useI18n } from '../../lib/i18n'

export function PluginsTab() {
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('plugins.desc')}</p>
      <ReprocessSection />
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><SummarySection /></div>
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><RelevanceSection /></div>
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><TopicsSection /></div>
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><ImageStorageSettings /></div>
    </div>
  )
}
