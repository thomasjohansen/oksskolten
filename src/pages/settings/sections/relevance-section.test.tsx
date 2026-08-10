import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelevanceSection, updateRelevanceWeight } from './relevance-section'

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
  it('keeps profile weights balanced and saves structured settings', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)
    const slider = screen.getByRole('slider', { name: 'Evidence & credibility' })
    fireEvent.change(slider, { target: { value: '50' } })
    await user.click(screen.getByRole('button', { name: 'Save brief' }))
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/api/settings/plugins/relevance/profile', expect.objectContaining({ profile: expect.objectContaining({ name: 'Balanced', weights: expect.any(Object) }) })))
  })

  it('toggles the persisted plugin control', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)
    await user.click(screen.getByRole('switch', { name: 'Toggle plugin' }))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/settings/plugins/relevance', { enabled: false })
  })

  it('redistributes remaining weight so the profile always sums to one', () => {
    const next = updateRelevanceWeight(profile.profile.weights, 'evidence_credibility', 0.5)
    expect(Object.values(next).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
    expect(next.evidence_credibility).toBe(0.5)
  })
})
