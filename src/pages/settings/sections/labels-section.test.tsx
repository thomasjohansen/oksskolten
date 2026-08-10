import { describe, expect, it } from 'vitest'
import { labelToForm } from './labels-section'
import type { LabelWithCount } from '../../../../shared/types'

const base = { id: 1, name: 'Climate', match_text: '', match_field: 'both' as const, sort_order: 0, created_at: '', auto_summarize: 0, exclusive: 0, article_count: 2, rules: [] }

describe('labelToForm', () => {
  it('keeps AI-created ruleless labels editable without inventing a rule', () => {
    expect(labelToForm({ ...base, origin: 'ai' } as LabelWithCount).rules).toEqual([])
  })

  it('preserves the manual label rule requirement', () => {
    expect(labelToForm(base as LabelWithCount).rules).toHaveLength(1)
  })
})
