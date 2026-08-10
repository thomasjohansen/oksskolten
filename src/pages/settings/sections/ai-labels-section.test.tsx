import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiLabelsSection } from './ai-labels-section'

const mockApiPatch = vi.fn()
const health = { plugin_id: 'omos.ai-labels', enabled: true, allow_new_labels: false, pending: 0, running: 0, failed: 0, dead: 0, succeeded: 1 }
vi.mock('../../../lib/fetcher', () => ({ fetcher: vi.fn(), apiPatch: (...args: unknown[]) => mockApiPatch(...args) }))
vi.mock('swr', () => ({ default: () => ({ data: health, mutate: vi.fn() }) }))

beforeEach(() => { vi.clearAllMocks(); mockApiPatch.mockResolvedValue({ ...health, allow_new_labels: true }) })

describe('AiLabelsSection', () => {
  it('shows the AI Labels card and persists allow-new-labels', async () => {
    const user = userEvent.setup()
    render(<AiLabelsSection />)
    await user.click(screen.getByRole('switch', { name: 'Allow new labels' }))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/settings/plugins/ai-labels/config', { allow_new_labels: true })
  })
})
