import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReprocessSection } from './reprocess-section'

const mockApiPost = vi.fn()
vi.mock('../../../lib/fetcher', () => ({ apiPost: (...args: unknown[]) => mockApiPost(...args) }))
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

beforeEach(() => vi.clearAllMocks())

describe('ReprocessSection', () => {
  it('queues all static AI modules with the bounded limit and reports counts', async () => {
    mockApiPost.mockResolvedValue({
      limit: 50,
      selected: 4,
      modules: {
        summary: { queued: 3, skipped: 1 },
        relevance: { queued: 2, skipped: 2 },
        topics: { queued: 4, skipped: 0 },
      },
    })
    const user = userEvent.setup()
    render(<ReprocessSection />)

    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/internal/reprocess', {
      modules: ['summary', 'relevance', 'topics'],
      limit: 50,
    }))
    expect(screen.getByText('plugins.reprocess.checked')).toBeTruthy()
    expect(screen.getByText('plugins.summary.title')).toBeTruthy()
    expect(screen.getByText('plugins.relevance.title')).toBeTruthy()
    expect(screen.getByText('plugins.topics.title')).toBeTruthy()
    expect(screen.getAllByText('plugins.reprocess.moduleCounts')).toHaveLength(3)
  })

  it('reports a queueing error', async () => {
    mockApiPost.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    render(<ReprocessSection />)
    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    expect(await screen.findByText('plugins.reprocess.error')).toBeTruthy()
  })
})
