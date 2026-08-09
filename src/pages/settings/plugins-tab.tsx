import { ImageStorageSettings } from '../../components/settings/image-storage-settings'
import { RelevanceSection } from './sections/relevance-section'
import { SummarySection } from './sections/summary-section'
import { ReprocessSection } from './sections/reprocess-section'
import { useI18n } from '../../lib/i18n'

export function PluginsTab() {
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('plugins.desc')}</p>
      <ReprocessSection />
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><SummarySection /></div>
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><RelevanceSection /></div>
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5">
        <section aria-labelledby="topics-plugin-title">
          <h2 id="topics-plugin-title" className="text-base font-semibold text-text mb-1">{t('plugins.topics.title')}</h2>
          <p className="text-xs text-muted max-w-2xl">{t('plugins.topics.desc')}</p>
          <span className="mt-4 inline-flex rounded-full border border-border px-2 py-1 text-[11px] text-muted">{t('plugins.bundled')}</span>
        </section>
      </div>
      <div className="rounded-xl border border-border bg-bg-subtle/30 p-5"><ImageStorageSettings /></div>
    </div>
  )
}
