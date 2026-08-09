import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelevanceSection } from './relevance-section'

const mockApiPut = vi.fn()
let data: { brief: string | null; revision: number } | undefined

vi.mock('../../../lib/fetcher', () => ({ fetcher: vi.fn(), apiPut: (...args: unknown[]) => mockApiPut(...args) }))
vi.mock('swr', () => ({ default: () => ({ data, mutate: vi.fn() }) }))

beforeEach(() => {
  vi.clearAllMocks()
  data = { brief: null, revision: 0 }
})

describe('RelevanceSection', () => {
  it('explains the empty state and saves a new brief', async () => {
    const user = userEvent.setup()
    mockApiPut.mockResolvedValue({ brief: 'Climate policy', revision: 1 })
    render(<RelevanceSection />)
    expect(screen.getByText(/will not receive relevance scores yet/)).toBeTruthy()
    await user.type(screen.getByLabelText('Your relevance brief'), 'Climate policy')
    await user.click(screen.getByRole('button', { name: 'Save brief' }))
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/api/settings/relevance', { brief: 'Climate policy' }))
    expect(screen.getByText(/existing articles are not automatically rescored/)).toBeTruthy()
  })
})
