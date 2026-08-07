import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openrouterProvider, getOpenRouterBaseUrl, getOpenRouterApiKey } from './openrouter.js'
import * as db from '../../db.js'

vi.mock('../../db.js', () => ({ getSetting: vi.fn() }))
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'test response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }) } }
  },
}))

describe('openrouterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.OPENROUTER_BASE_URL
  })

  it('resolves base URL from settings, env, then default', () => {
    vi.mocked(db.getSetting).mockReturnValue('https://proxy.example/api/v1')
    expect(getOpenRouterBaseUrl()).toBe('https://proxy.example/api/v1')
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    process.env.OPENROUTER_BASE_URL = 'https://env.example/api/v1'
    expect(getOpenRouterBaseUrl()).toBe('https://env.example/api/v1')
    delete process.env.OPENROUTER_BASE_URL
    expect(getOpenRouterBaseUrl()).toBe('https://openrouter.ai/api/v1')
  })

  it('loads the API key from settings and requires it', () => {
    vi.mocked(db.getSetting).mockImplementation((key) => key === 'api_key.openrouter' ? 'sk-or-key' : undefined)
    expect(getOpenRouterApiKey()).toBe('sk-or-key')
    expect(() => openrouterProvider.requireKey()).not.toThrow()
    vi.mocked(db.getSetting).mockReturnValue(undefined)
    expect(() => openrouterProvider.requireKey()).toThrow('OPENROUTER_KEY_NOT_SET')
  })

  it('creates a completion and returns token usage', async () => {
    vi.mocked(db.getSetting).mockImplementation((key) => key === 'api_key.openrouter' ? 'sk-or-key' : undefined)
    const result = await openrouterProvider.createMessage({
      model: 'openai/gpt-4o-mini', maxTokens: 100,
      messages: [{ role: 'user', content: 'hello' }], systemInstruction: 'you are a bot',
    })
    expect(result).toEqual({ text: 'test response', inputTokens: 10, outputTokens: 20 })
  })
})
