import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabelsSection, labelToForm } from './labels-section'
import type { LabelWithCount } from '../../../../shared/types'

const mockApiPost = vi.fn()
const mockMutate = vi.fn()
const base = { id: 1, name: 'Climate', match_text: '', match_field: 'both' as const, sort_order: 0, created_at: '', auto_summarize: 0, exclusive: 0, article_count: 2, rules: [] }
const candidate = { ...base, id: 9, name: 'Climate policy', lifecycle_status: 'candidate' as const, origin: 'ai' as const, ai_confidence: 0.92 }
const visible = { ...base, id: 2, lifecycle_status: 'promoted' as const, origin: 'user' as const }
let mockLabels = [visible, candidate]

vi.mock('../../../lib/fetcher', () => ({
  fetcher: vi.fn(() => Promise.resolve({ labels: [visible, candidate] })),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}))
vi.mock('swr', () => ({
  default: () => ({ data: { labels: mockLabels } }),
  useSWRConfig: () => ({ mutate: mockMutate }),
}))
vi.mock('../../../app', () => ({
  useAppLayout: () => ({ settings: { labelUnreadOnly: 'off', setLabelUnreadOnly: vi.fn() } }),
}))
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mockLabels = [visible, candidate]
  mockApiPost.mockResolvedValue({})
})

describe('label candidate review', () => {
  it('renders AI suggestions separately from visible labels', () => {
    render(<LabelsSection />)

    expect(screen.getByText('settings.labelCandidates')).toBeTruthy()
    expect(screen.getByText('Climate policy')).toBeTruthy()
    expect(screen.getAllByText('Climate').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'settings.labelPromote' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'settings.labelDismiss' })).toBeTruthy()
  })

  it('does not render the review section when there are no candidates', async () => {
    mockLabels = [visible]
    render(<LabelsSection />)
    expect(screen.queryByText('settings.labelCandidates')).toBeNull()
  })

  it('promotes a candidate and refreshes label, sidebar, and article caches', async () => {
    const user = userEvent.setup()
    render(<LabelsSection />)
    await user.click(screen.getByRole('button', { name: 'settings.labelPromote' }))

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/labels/9/promote'))
    expect(mockMutate).toHaveBeenCalled()
    const refreshPredicate = mockMutate.mock.calls[0][0] as (key: unknown) => boolean
    expect(refreshPredicate('/api/labels?include_candidates=1')).toBe(true)
    expect(refreshPredicate('/api/feeds')).toBe(true)
    expect(refreshPredicate('/api/articles?unread=1')).toBe(true)
  })

  it('merges a candidate into the selected visible label', async () => {
    const user = userEvent.setup()
    render(<LabelsSection />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'settings.labelMergeTarget' }), '2')
    await user.click(screen.getByRole('button', { name: 'settings.labelMerge' }))

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/labels/9/merge', { target_label_id: 2 }))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('requires confirmation before dismissing a candidate', async () => {
    const user = userEvent.setup()
    render(<LabelsSection />)
    await user.click(screen.getByRole('button', { name: 'settings.labelDismiss' }))
    expect(screen.getByText('settings.labelDismissConfirm')).toBeTruthy()
    expect(mockApiPost).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'settings.labelDismissConfirmAction' }))
    expect(mockApiPost).toHaveBeenCalledWith('/api/labels/9/dismiss')
  })

  it('shows an unobtrusive error when a candidate action fails', async () => {
    mockApiPost.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    render(<LabelsSection />)
    await user.click(screen.getByRole('button', { name: 'settings.labelPromote' }))
    expect(await screen.findByText('settings.labelCandidateError')).toBeTruthy()
  })
})

describe('labelToForm', () => {
  it('keeps AI-created ruleless labels editable without inventing a rule', () => {
    expect(labelToForm({ ...base, origin: 'ai' } as LabelWithCount).rules).toEqual([])
  })

  it('preserves the manual label rule requirement', () => {
    expect(labelToForm(base as LabelWithCount).rules).toHaveLength(1)
  })
})
