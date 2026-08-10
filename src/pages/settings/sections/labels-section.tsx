import { useState, useCallback, useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { useI18n } from '../../../lib/i18n'
import { fetcher, apiPost, apiPatch, apiDelete } from '../../../lib/fetcher'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup } from '@/components/ui/radio-group'
import { useAppLayout } from '../../../app'
import type { LabelWithCount } from '../../../../shared/types'

type MatchField = 'title' | 'full_text' | 'both'
type RuleType = 'and' | 'or' | 'not'
type SettingsLabel = LabelWithCount & { ai_confidence?: number | null }

interface RuleForm {
  match_text: string
  match_field: MatchField
  rule_type: RuleType
}

interface LabelForm {
  name: string
  auto_summarize: boolean
  exclusive: boolean
  rules: RuleForm[]
}

const EMPTY_RULE: RuleForm = { match_text: '', match_field: 'both', rule_type: 'or' }
const EMPTY_FORM: LabelForm = { name: '', auto_summarize: false, exclusive: false, rules: [{ ...EMPTY_RULE }] }

function matchFieldLabel(field: MatchField, t: ReturnType<typeof useI18n>['t']): string {
  if (field === 'title') return t('settings.labelMatchFieldTitle')
  if (field === 'full_text') return t('settings.labelMatchFieldFullText')
  return t('settings.labelMatchFieldBoth')
}


export function labelToForm(label: LabelWithCount): LabelForm {
  const rules: RuleForm[] = label.rules.length > 0
    ? label.rules.map(r => ({ match_text: r.match_text, match_field: r.match_field, rule_type: r.rule_type }))
    : label.origin === 'ai' ? [] : [{ match_text: label.match_text, match_field: label.match_field, rule_type: 'or' as const }]
  return { name: label.name, auto_summarize: label.auto_summarize === 1, exclusive: label.exclusive === 1, rules }
}

export function LabelsSection() {
  const { t } = useI18n()
  const { settings } = useAppLayout()
  const { mutate: globalMutate } = useSWRConfig()
  const { data } = useSWR<{ labels: SettingsLabel[] }>('/api/labels?include_candidates=1', fetcher)
  const labels = useMemo(() => data?.labels ?? [], [data])
  const candidates = useMemo(() => labels.filter(label => label.lifecycle_status === 'candidate'), [labels])
  const visibleLabels = useMemo(() => labels.filter(label => label.lifecycle_status !== 'candidate'), [labels])

  const [form, setForm] = useState<LabelForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [mergeTargets, setMergeTargets] = useState<Record<number, string>>({})
  const [candidateBusyId, setCandidateBusyId] = useState<number | null>(null)
  const [candidateErrorId, setCandidateErrorId] = useState<number | null>(null)
  const [dismissId, setDismissId] = useState<number | null>(null)

  const revalidate = useCallback(() => {
    void globalMutate((key: unknown) => typeof key === 'string' && (
      key.startsWith('/api/labels') || key.startsWith('/api/feeds') || key.startsWith('/api/articles')
    ))
  }, [globalMutate])

  const handleCandidateAction = useCallback(async (id: number, action: 'promote' | 'dismiss') => {
    setCandidateBusyId(id)
    setCandidateErrorId(null)
    try {
      const url = action === 'promote'
        ? `/api/labels/${id}/promote`
        : `/api/labels/${id}/dismiss`
      await apiPost(url)
      revalidate()
      if (action === 'dismiss') setDismissId(null)
    } catch {
      setCandidateErrorId(id)
    } finally {
      setCandidateBusyId(null)
    }
  }, [revalidate])

  const handleMerge = useCallback(async (id: number) => {
    const targetId = Number(mergeTargets[id])
    if (!targetId) return
    setCandidateBusyId(id)
    setCandidateErrorId(null)
    try {
      await apiPost(`/api/labels/${id}/merge`, { target_label_id: targetId })
      setMergeTargets(current => ({ ...current, [id]: '' }))
      revalidate()
    } catch {
      setCandidateErrorId(id)
    } finally {
      setCandidateBusyId(null)
    }
  }, [mergeTargets, revalidate])

  const handleStartEdit = useCallback((label: LabelWithCount) => {
    setEditingId(label.id)
    setForm(labelToForm(label))
    setShowAdd(false)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    const editingLabel = editingId === null ? undefined : labels.find(label => label.id === editingId)
    if (editingId === null || !form.name.trim() || (editingLabel?.origin !== 'ai' && form.rules.some(r => !r.match_text.trim()))) return
    try {
      await apiPatch(`/api/labels/${editingId}`, form)
      setEditingId(null)
      setForm(EMPTY_FORM)
      revalidate()
    } catch {
      // keep edit state so the user can retry
    }
  }, [editingId, form, labels, revalidate])

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || form.rules.some(r => !r.match_text.trim())) return
    try {
      await apiPost('/api/labels', form)
      setForm(EMPTY_FORM)
      setShowAdd(false)
      revalidate()
    } catch {
      // keep form state so the user can retry
    }
  }, [form, revalidate])

  const handleDelete = useCallback(async () => {
    if (deleteId === null) return
    try {
      await apiDelete(`/api/labels/${deleteId}`)
      setDeleteId(null)
      revalidate()
    } catch {
      // keep dialog open so the user can retry
    }
  }, [deleteId, revalidate])

  const deletingLabel = deleteId !== null ? labels.find(l => l.id === deleteId) : null

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-1">{t('settings.labels')}</h2>
      <p className="text-xs text-muted mb-4">{t('settings.labelsDesc')}</p>

      {candidates.length > 0 && (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/5 p-3" aria-labelledby="label-candidates-title">
          <h3 id="label-candidates-title" className="text-sm font-medium text-text">{t('settings.labelCandidates')}</h3>
          <p className="mt-0.5 text-xs text-muted">{t('settings.labelCandidatesDesc')}</p>
          <div className="mt-2 space-y-2">
            {candidates.map(candidate => (
              <div key={candidate.id} className="rounded-md border border-border bg-bg-card px-2.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-text">{candidate.name}</span>
                    <span className="ml-2 text-xs text-muted">{t('settings.labelCandidateArticles', { count: String(candidate.article_count) })}</span>
                    {candidate.ai_confidence !== null && candidate.ai_confidence !== undefined && <span className="ml-2 text-xs text-muted">{Math.round(candidate.ai_confidence * 100)}%</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" disabled={candidateBusyId === candidate.id} onClick={() => void handleCandidateAction(candidate.id, 'promote')} className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-text hover:opacity-90 disabled:opacity-50">{t('settings.labelPromote')}</button>
                    <select
                      aria-label={t('settings.labelMergeTarget')}
                      value={mergeTargets[candidate.id] ?? ''}
                      onChange={event => setMergeTargets(current => ({ ...current, [candidate.id]: event.target.value }))}
                      className="h-7 max-w-36 rounded-md border border-border bg-bg px-1.5 text-xs text-text"
                    >
                      <option value="">{t('settings.labelMergeChoose')}</option>
                      {visibleLabels.filter(target => target.origin === 'user' || target.lifecycle_status === 'promoted').map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
                    </select>
                    <button type="button" disabled={candidateBusyId === candidate.id || !mergeTargets[candidate.id]} onClick={() => void handleMerge(candidate.id)} className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-hover disabled:opacity-50">{t('settings.labelMerge')}</button>
                    <button type="button" disabled={candidateBusyId === candidate.id} onClick={() => setDismissId(candidate.id)} className="rounded-md px-2 py-1 text-xs text-muted hover:text-error disabled:opacity-50">{t('settings.labelDismiss')}</button>
                  </div>
                </div>
                {candidateErrorId === candidate.id && <p role="alert" className="mt-1 text-xs text-error">{t('settings.labelCandidateError')}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5">
        <p className="text-sm text-text mb-2">{t('settings.labelUnreadOnly')}</p>
        <RadioGroup
          name="labelUnreadOnly"
          options={[
            { value: 'on' as const, label: t('common.on') },
            { value: 'off' as const, label: t('common.off') },
          ]}
          value={settings.labelUnreadOnly}
          onChange={(val) => settings.setLabelUnreadOnly(val as 'on' | 'off')}
        />
      </div>

      <div className="space-y-2">
        {visibleLabels.length === 0 && !showAdd && (
          <p className="text-sm text-muted">{t('settings.labelsEmpty')}</p>
        )}

        {visibleLabels.map((label) =>
          editingId === label.id ? (
            <LabelFormRow
              key={label.id}
              form={form}
              onChange={setForm}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
              allowEmptyRules={label.origin === 'ai'}
            />
          ) : (
            <LabelRow
              key={label.id}
              label={label}
              onEdit={handleStartEdit}
              onDelete={setDeleteId}
            />
          ),
        )}

        {showAdd && (
          <LabelFormRow
            form={form}
            onChange={setForm}
            onSave={handleCreate}
            onCancel={() => { setShowAdd(false); setForm(EMPTY_FORM) }}
          />
        )}
      </div>

      {!showAdd && editingId === null && (
        <button
          type="button"
          onClick={() => { setShowAdd(true); setForm(EMPTY_FORM) }}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:opacity-80 transition-opacity"
        >
          <Plus size={14} />
          {t('settings.addLabel')}
        </button>
      )}

      {deletingLabel && (
        <ConfirmDialog
          title={t('feeds.delete')}
          message={t('settings.labelDeleteConfirm', { name: deletingLabel.name })}
          danger
          confirmLabel={t('feeds.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
      {dismissId !== null && (
        <ConfirmDialog
          title={t('settings.labelDismiss')}
          message={t('settings.labelDismissConfirm')}
          confirmLabel={t('settings.labelDismissConfirmAction')}
          onConfirm={() => void handleCandidateAction(dismissId, 'dismiss')}
          onCancel={() => setDismissId(null)}
        />
      )}
    </section>
  )
}

interface LabelRowProps {
  label: LabelWithCount
  onEdit: (label: LabelWithCount) => void
  onDelete: (id: number) => void
}

function LabelRow({ label, onEdit, onDelete }: LabelRowProps) {
  const { t } = useI18n()
  const rules = label.rules.length > 0
    ? label.rules
    : label.origin === 'ai' ? [] : [{ match_text: label.match_text, match_field: label.match_field, rule_type: 'or' as const }]

  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-text">{label.name}</span>
        {label.auto_summarize === 1 && (
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">AI</span>
        )}
        {label.origin === 'ai' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t('settings.labelAiCreated')}</span>}
        {label.exclusive === 1 && (
          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-muted/20 text-muted">{t('settings.labelExclusive')}</span>
        )}
        <div className="mt-0.5 space-y-0.5">
          {rules.length === 0 && <span className="block text-xs text-muted">{t('settings.labelNoRules')}</span>}
          {rules.map((r, i) => (
            <span key={i} className="block text-xs text-muted">
              <span className="font-mono uppercase text-[10px] mr-1 opacity-60">{r.rule_type}</span>
              {r.match_text}
              {' · '}
              {matchFieldLabel(r.match_field, t)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 pt-0.5">
        <span className="text-xs text-muted tabular-nums">{label.article_count}</span>
        <button
          type="button"
          onClick={() => onEdit(label)}
          className="text-muted hover:text-text transition-colors"
          aria-label={t('settings.editLabel')}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(label.id)}
          className="text-muted hover:text-error transition-colors"
          aria-label={t('feeds.delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

interface LabelFormRowProps {
  form: LabelForm
  onChange: (f: LabelForm) => void
  onSave: () => void
  onCancel: () => void
  allowEmptyRules?: boolean
}

function LabelFormRow({ form, onChange, onSave, onCancel, allowEmptyRules = false }: LabelFormRowProps) {
  const { t } = useI18n()
  const canSave = form.name.trim().length > 0 && (allowEmptyRules || (form.rules.length > 0 && form.rules.every(r => r.match_text.trim().length > 0)))

  const updateRule = (i: number, patch: Partial<RuleForm>) => {
    const rules = form.rules.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    onChange({ ...form, rules })
  }

  const addRule = () => onChange({ ...form, rules: [...form.rules, { ...EMPTY_RULE }] })

  const removeRule = (i: number) => {
    if (form.rules.length <= 1) return
    onChange({ ...form, rules: form.rules.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-accent bg-bg-card">
      <input
        type="text"
        placeholder={t('settings.labelName')}
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="w-full px-2 py-1 text-sm rounded-lg border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
      />

      <div className="space-y-2">
        {form.rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Select
              value={rule.rule_type}
              onValueChange={(v) => updateRule(i, { rule_type: v as RuleType })}
            >
              <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="or" textValue="OR">{t('settings.labelRuleTypeOr')}</SelectItem>
                <SelectItem value="and" textValue="AND">{t('settings.labelRuleTypeAnd')}</SelectItem>
                <SelectItem value="not" textValue="NOT">{t('settings.labelRuleTypeNot')}</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="text"
              placeholder={t('settings.labelMatchText')}
              value={rule.match_text}
              onChange={(e) => updateRule(i, { match_text: e.target.value })}
              className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-bg text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Select
              value={rule.match_field}
              onValueChange={(v) => updateRule(i, { match_field: v as MatchField })}
            >
              <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">{t('settings.labelMatchFieldBoth')}</SelectItem>
                <SelectItem value="title">{t('settings.labelMatchFieldTitle')}</SelectItem>
                <SelectItem value="full_text">{t('settings.labelMatchFieldFullText')}</SelectItem>
              </SelectContent>
            </Select>
            {form.rules.length > 1 && (
              <button
                type="button"
                onClick={() => removeRule(i)}
                className="p-1 text-muted hover:text-error transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRule}
        className="self-start inline-flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity"
      >
        <Plus size={12} />
        {t('settings.labelAddRule')}
      </button>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.auto_summarize}
          onChange={(e) => onChange({ ...form, auto_summarize: e.target.checked })}
          className="rounded accent-accent"
        />
        <span className="text-xs text-text">{t('settings.labelAutoSummarize')}</span>
        <span className="text-xs text-muted">— {t('settings.labelAutoSummarizeDesc')}</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.exclusive}
          onChange={(e) => onChange({ ...form, exclusive: e.target.checked })}
          className="rounded accent-accent"
        />
        <span className="text-xs text-text">{t('settings.labelExclusive')}</span>
        <span className="text-xs text-muted">— {t('settings.labelExclusiveDesc')}</span>
      </label>

      <div className="flex items-center gap-2 self-end">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="p-1.5 rounded-lg text-accent hover:bg-hover disabled:opacity-40 transition-colors"
          aria-label={t('settings.addLabel')}
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-muted hover:bg-hover transition-colors"
          aria-label={t('confirm.cancel')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
