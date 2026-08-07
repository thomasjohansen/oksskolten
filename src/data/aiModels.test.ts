import { describe, expect, it } from 'vitest'
import { LLM_API_PROVIDERS, LLM_TASK_PROVIDERS, PROVIDER_LABELS, DEFAULT_MODELS } from './aiModels'

describe('OpenRouter client provider catalog', () => {
  it('adds OpenRouter without dropping existing API providers', () => {
    expect(LLM_API_PROVIDERS).toEqual(['anthropic', 'gemini', 'openai', 'openrouter'])
    expect(LLM_TASK_PROVIDERS).toContain('ollama')
    expect(LLM_TASK_PROVIDERS).toContain('vllm')
    expect(LLM_TASK_PROVIDERS).toContain('openrouter')
  })

  it('provides a label and dynamic-model default for OpenRouter', () => {
    expect(PROVIDER_LABELS.openrouter).toBe('provider.openrouter')
    expect(DEFAULT_MODELS.openrouter).toBe('')
  })
})
