import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelevanceSection, SIGNAL_KEYS, updateRelevanceWeight } from './relevance-section'

const mockApiPut = vi.fn()
const mockApiPatch = vi.fn()
const profile = {
  profile: { version: 1 as const, name: 'Balanced' as const, weights: {
    evidence_credibility: 0.2, public_significance: 0.2, information_value: 0.2,
    constructive_positive_impact: 0.15, clickbait_penalty: 0.1, paywall_penalty: 0.075, distressing_conflict_war_penalty: 0.075,
  } }, revision: 1, configured: true, enabled: true,
}
const health = { plugin_id: 'omos.relevance', enabled: true, pending: 0, running: 0, failed: 0, dead: 0, succeeded: 2 }

vi.mock('../../../lib/fetcher', () => ({ fetcher: vi.fn(), apiPut: (...args: unknown[]) => mockApiPut(...args), apiPatch: (...args: unknown[]) => mockApiPatch(...args) }))
vi.mock('swr', () => ({ default: (key: string) => key.includes('/profile') ? { data: profile, mutate: vi.fn() } : { data: health, mutate: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  mockApiPut.mockResolvedValue(profile)
  mockApiPatch.mockResolvedValue(health)
})

describe('RelevanceSection', () => {
  it('keeps every other slider unchanged when one slider moves', () => {
    render(<RelevanceSection />)
    const sliders = screen.getAllByRole('slider')
    const before = sliders.map(slider => (slider as HTMLInputElement).value)

    expect(sliders.every(slider => slider.getAttribute('min') === '0')).toBe(true)
    expect(sliders.every(slider => slider.getAttribute('max') === '100')).toBe(true)
    expect(sliders.every(slider => slider.getAttribute('step') === '1')).toBe(true)

    fireEvent.change(sliders[0], { target: { value: '10' } })

    const after = screen.getAllByRole('slider').map(slider => (slider as HTMLInputElement).value)
    expect(after[0]).toBe('10')
    expect(after.slice(1)).toEqual(before.slice(1))
  })

  it('keeps a remaining summary visible and only enables save at exactly 100%', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)
    const evidence = screen.getByRole('slider', { name: 'Evidence & credibility' })
    const significance = screen.getByRole('slider', { name: 'Public significance' })
    const save = screen.getByRole('button', { name: 'Save brief' })

    expect(screen.getByText('Remaining: 0%')).toBeTruthy()
    expect(screen.queryByText(/Allocate the remaining/)).toBeNull()
    expect(save.hasAttribute('disabled')).toBe(true)

    fireEvent.change(evidence, { target: { value: '10' } })
    expect(screen.getByText('Remaining: 10%')).toBeTruthy()
    expect(screen.getByText('Allocate the remaining 10% to save.')).toBeTruthy()
    expect(save.hasAttribute('disabled')).toBe(true)

    fireEvent.change(significance, { target: { value: '30' } })
    expect(screen.getByText('Remaining: 0%')).toBeTruthy()
    expect(screen.queryByText(/Allocate the remaining/)).toBeNull()
    expect(save.hasAttribute('disabled')).toBe(false)

    await user.click(save)
    await waitFor(() => expect(mockApiPut).toHaveBeenCalled())
  })

  it('caps an increase at the current value plus the available budget', () => {
    render(<RelevanceSection />)
    const evidence = screen.getByRole('slider', { name: 'Evidence & credibility' })
    const significance = screen.getByRole('slider', { name: 'Public significance' })

    fireEvent.change(evidence, { target: { value: '10' } })
    expect(significance.getAttribute('max')).toBe('100')

    fireEvent.change(significance, { target: { value: '40' } })
    expect((significance as HTMLInputElement).value).toBe('30')
    expect((evidence as HTMLInputElement).value).toBe('10')
  })

  it('saves whole percentages as weights that sum to one', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)
    const evidence = screen.getByRole('slider', { name: 'Evidence & credibility' })
    const significance = screen.getByRole('slider', { name: 'Public significance' })
    fireEvent.change(evidence, { target: { value: '10' } })
    fireEvent.change(significance, { target: { value: '30' } })
    await user.click(screen.getByRole('button', { name: 'Save brief' }))
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/api/settings/plugins/relevance/profile', expect.objectContaining({ profile: expect.objectContaining({ name: 'Balanced', weights: expect.any(Object) }) })))
    const payload = mockApiPut.mock.calls[0][1] as { profile: { weights: Record<string, number> } }
    expect(Object.values(payload.profile.weights).reduce((sum, value) => sum + value, 0)).toBe(1)
    expect(payload.profile.weights.evidence_credibility).toBe(0.1)
    expect(payload.profile.weights.public_significance).toBe(0.3)
  })

  it('toggles the persisted plugin control', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)
    await user.click(screen.getByRole('switch', { name: 'Toggle plugin' }))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/settings/plugins/relevance', { enabled: false })
  })

  it('updates only the selected weight', () => {
    const next = updateRelevanceWeight(profile.profile.weights, 'evidence_credibility', 0.5)
    expect(next.evidence_credibility).toBe(0.5)
    expect(next.public_significance).toBe(profile.profile.weights.public_significance)
    expect(next.information_value).toBe(profile.profile.weights.information_value)
    expect(Object.keys(next)).toHaveLength(SIGNAL_KEYS.length)
  })
})
