import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelevanceSection } from './relevance-section'

const mockApiPut = vi.fn()
const mockApiPatch = vi.fn()
const brief = { brief: 'Reliable reporting on public health and science.', revision: 3 }
const health = { plugin_id: 'omos.relevance', enabled: true, pending: 0, running: 0, failed: 0, dead: 0, succeeded: 2 }

vi.mock('../../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
}))
vi.mock('swr', () => ({
  default: (key: string) => key === '/api/settings/relevance'
    ? { data: brief, mutate: vi.fn() }
    : { data: health, mutate: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  health.enabled = true
  mockApiPut.mockResolvedValue(brief)
  mockApiPatch.mockResolvedValue(health)
})

describe('RelevanceSection', () => {
  it('loads the saved reading brief without using the retired profile endpoint', () => {
    render(<RelevanceSection />)

    expect((screen.getByRole('textbox', { name: 'Reading brief' }) as HTMLTextAreaElement).value).toBe(brief.brief)
    expect(screen.getByText('Inbox scores articles by how well they match this brief.')).toBeTruthy()
    expect(screen.getByPlaceholderText('For example: thoughtful reporting on science, cities, and the people shaping everyday life.')).toBeTruthy()
  })

  it('saves a changed brief and confirms success', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)
    const textarea = screen.getByRole('textbox', { name: 'Reading brief' })
    const save = screen.getByRole('button', { name: 'Save brief' })

    expect(save.hasAttribute('disabled')).toBe(true)
    await user.clear(textarea)
    await user.type(textarea, 'In-depth reporting on housing and local government.')
    expect(save.hasAttribute('disabled')).toBe(false)

    await user.click(save)

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/api/settings/relevance', {
      brief: 'In-depth reporting on housing and local government.',
    }))
    expect(screen.getByRole('status').textContent).toBe('Brief saved. New articles will use it.')
  })

  it('allows an existing brief to be cleared', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)

    await user.clear(screen.getByRole('textbox', { name: 'Reading brief' }))
    await user.click(screen.getByRole('button', { name: 'Save brief' }))

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/api/settings/relevance', { brief: '' }))
  })

  it('shows a save error and keeps the edited brief available to retry', async () => {
    const user = userEvent.setup()
    mockApiPut.mockRejectedValueOnce(new Error('offline'))
    render(<RelevanceSection />)
    const textarea = screen.getByRole('textbox', { name: 'Reading brief' })

    await user.clear(textarea)
    await user.type(textarea, 'A new focus')
    await user.click(screen.getByRole('button', { name: 'Save brief' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Could not save the brief. Try again.'))
    expect((textarea as HTMLTextAreaElement).value).toBe('A new focus')
    expect(screen.getByRole('button', { name: 'Save brief' }).hasAttribute('disabled')).toBe(false)
  })

  it('explains when relevance is disabled and prevents brief edits until it is enabled', () => {
    health.enabled = false
    render(<RelevanceSection />)

    expect(screen.getByText('Relevance is off. Turn it on to edit the brief and score new articles.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Reading brief' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save brief' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps the persisted plugin switch', async () => {
    const user = userEvent.setup()
    render(<RelevanceSection />)

    await user.click(screen.getByRole('switch', { name: 'Toggle plugin' }))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/settings/plugins/relevance', { enabled: false })
  })
})
