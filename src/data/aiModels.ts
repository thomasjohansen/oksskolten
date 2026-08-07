import {
  DEFAULT_MODELS as SHARED_DEFAULT_MODELS,
  PROVIDER_LABELS as SHARED_PROVIDER_LABELS,
  LLM_API_PROVIDERS as SHARED_LLM_API_PROVIDERS,
} from '../../shared/models'

export {
  ANTHROPIC_MODELS, GEMINI_MODELS, OPENAI_MODELS, TRANSLATE_SERVICE_PROVIDERS,
  type ModelDef, type ModelGroup,
} from '../../shared/models'

export const DEFAULT_MODELS: Record<string, string> = { ...SHARED_DEFAULT_MODELS, openrouter: '' }
export const PROVIDER_LABELS: Record<string, string> = {
  ...SHARED_PROVIDER_LABELS,
  openrouter: 'provider.openrouter',
}
export const LLM_API_PROVIDERS = [...SHARED_LLM_API_PROVIDERS, 'openrouter'] as const
export const LLM_TASK_PROVIDERS = [...LLM_API_PROVIDERS, 'claude-code', 'ollama', 'vllm'] as const
