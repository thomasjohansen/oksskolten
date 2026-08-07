import OpenAI from 'openai'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
let cachedBaseUrl = ''
let cachedApiKey = ''
let cachedClient: OpenAI | null = null

export function getOpenRouterBaseUrl(): string {
  return getSetting('openrouter.base_url') || process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL
}

export function getOpenRouterApiKey(): string {
  return getSetting('api_key.openrouter') || ''
}

export function getOpenRouterClient(): OpenAI {
  const baseUrl = getOpenRouterBaseUrl()
  const apiKey = getOpenRouterApiKey()
  if (cachedClient && baseUrl === cachedBaseUrl && apiKey === cachedApiKey) return cachedClient
  cachedBaseUrl = baseUrl
  cachedApiKey = apiKey
  cachedClient = new OpenAI({ baseURL: baseUrl.replace(/\/+$/, ''), apiKey, defaultHeaders: { 'X-Title': 'Oksskolten' } })
  return cachedClient
}

function messages(params: LLMMessageParams): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = []
  if (params.systemInstruction) result.push({ role: 'system', content: params.systemInstruction })
  for (const message of params.messages) {
    result.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })
  }
  return result
}

export const openrouterProvider: LLMProvider = {
  name: 'openrouter',
  requireKey() {
    if (!getSetting('api_key.openrouter')) throw new Error('OPENROUTER_KEY_NOT_SET')
  },
  async createMessage(params) {
    const response = await getOpenRouterClient().chat.completions.create({
      model: params.model, max_completion_tokens: params.maxTokens, messages: messages(params),
    })
    return {
      text: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    }
  },
  async streamMessage(params, onText): Promise<LLMStreamResult> {
    const stream = await getOpenRouterClient().chat.completions.create({
      model: params.model, max_completion_tokens: params.maxTokens, messages: messages(params),
      stream: true, stream_options: { include_usage: true },
    })
    let text = ''
    let inputTokens = 0
    let outputTokens = 0
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) { text += delta; onText(delta) }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens
        outputTokens = chunk.usage.completion_tokens ?? outputTokens
      }
    }
    return { text, inputTokens, outputTokens }
  },
}
