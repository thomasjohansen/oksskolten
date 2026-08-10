import { useState } from 'react'
import { apiPatch } from '../../../lib/fetcher'
import { useI18n } from '../../../lib/i18n'

export interface PluginHealth {
  plugin_id: string
  enabled: boolean
  pending: number
  running: number
  failed: number
  dead: number
  succeeded: number
}

export function PluginToggle({ health, onChange }: { health: PluginHealth; onChange: (next: PluginHealth) => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      const next = await apiPatch(`/api/settings/plugins/${health.plugin_id.replace('omos.', '')}`, { enabled: !health.enabled }) as PluginHealth
      onChange(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{health.enabled ? t('plugins.enabled') : t('plugins.disabled')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={health.enabled}
        aria-label={t('plugins.toggle')}
        onClick={() => void toggle()}
        disabled={busy}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${health.enabled ? 'bg-accent' : 'bg-border'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${health.enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}
