import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReprocessSection } from './reprocess-section'

const mockApiPost = vi.fn()
const mockFetcher = vi.fn()
vi.mock('../../../lib/fetcher', async () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  fetcher: (...args: unknown[]) => mockFetcher(...args),
}))
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('ReprocessSection', () => {
  it('starts a run and shows queued progress', async () => {
    mockApiPost.mockResolvedValue({ run_id: 'run-123' })
    mockFetcher.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(<ReprocessSection />)

    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/internal/reprocess', {
      modules: ['summary', 'relevance', 'ai_labels'],
      limit: 50,
    }))
    expect(screen.getByText('plugins.reprocess.progress')).toBeTruthy()
    expect(screen.getByText('0 / 0')).toBeTruthy()
    expect(mockFetcher).toHaveBeenCalledWith('/api/internal/reprocess/run-123')
  })

  it('polls progress and reports terminal module counts', async () => {
    mockApiPost.mockResolvedValue({ run_id: 'run-123' })
    mockFetcher
      .mockResolvedValueOnce({
        run_id: 'run-123',
        status: 'running',
        modules: {
          summary: { total: 4, pending: 1, running: 1, succeeded: 2, failed: 0, skipped: 0 },
          relevance: { total: 4, pending: 0, running: 0, succeeded: 3, failed: 0, skipped: 1 },
          ai_labels: { total: 4, pending: 0, running: 0, succeeded: 1, failed: 1, skipped: 2 },
        },
      })
      .mockResolvedValueOnce({
        run_id: 'run-123',
        status: 'succeeded',
        modules: {
          summary: { total: 4, pending: 0, running: 0, succeeded: 4, failed: 0, skipped: 0 },
          relevance: { total: 4, pending: 0, running: 0, succeeded: 3, failed: 0, skipped: 1 },
          ai_labels: { total: 4, pending: 0, running: 0, succeeded: 1, failed: 1, skipped: 2 },
        },
      })
    const user = userEvent.setup()
    render(<ReprocessSection />)

    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    await waitFor(() => expect(screen.getByText('10 / 12')).toBeTruthy())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)) })
    await waitFor(() => expect(screen.getByText('plugins.reprocess.complete')).toBeTruthy())
    expect(screen.getByText('12 / 12')).toBeTruthy()
    expect(screen.getAllByText(/plugins\.reprocess\.moduleResult/)).toHaveLength(3)
  })

  it('explains failed and skipped work in the terminal state', async () => {
    mockApiPost.mockResolvedValue({ run_id: 'run-123' })
    mockFetcher.mockResolvedValue({
      run_id: 'run-123',
      status: 'failed',
      modules: {
        summary: { total: 2, pending: 0, running: 0, succeeded: 1, failed: 1, skipped: 0 },
        relevance: { total: 2, pending: 0, running: 0, succeeded: 0, failed: 0, skipped: 2 },
        ai_labels: { total: 2, pending: 0, running: 0, succeeded: 2, failed: 0, skipped: 0 },
      },
    })
    const user = userEvent.setup()
    render(<ReprocessSection />)

    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/api/internal/reprocess', {
      modules: ['summary', 'relevance', 'ai_labels'],
      limit: 50,
    }))
    expect(await screen.findByText('plugins.reprocess.failed')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('plugins.reprocess.failedExplained')
    expect(screen.getByRole('status').textContent).toContain('plugins.reprocess.skippedExplained')
    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reports a queueing error', async () => {
    mockApiPost.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    render(<ReprocessSection />)
    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    expect(await screen.findByText('plugins.reprocess.error')).toBeTruthy()
  })

  it('reports a polling error without leaving a permanent progress block', async () => {
    mockApiPost.mockResolvedValue({ run_id: 'run-123' })
    mockFetcher.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    render(<ReprocessSection />)
    await user.click(screen.getByRole('button', { name: 'plugins.reprocess.action' }))
    expect(await screen.findByText('plugins.reprocess.error')).toBeTruthy()
    expect(screen.queryByText('plugins.reprocess.progress')).toBeNull()
  })
})
