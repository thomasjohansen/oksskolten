# OpenRouter LLM Provider

OpenRouter is an OpenAI-compatible hosted gateway for multiple model vendors.

## Server contract

The `openrouter` provider requires `api_key.openrouter`. Its base URL is resolved
from `openrouter.base_url`, `OPENROUTER_BASE_URL`, or
`https://openrouter.ai/api/v1`, in that order. The OpenAI SDK client is rebuilt
when either the URL or key changes and sends `X-Title: Oksskolten`.

OpenRouter models are dynamic and are not included in the static shared model
catalog. Settings validation therefore accepts any model string when a task's
provider is `openrouter`.

## API endpoints

- `GET /api/settings/api-keys/openrouter` returns `{ configured: boolean }`.
- `POST /api/settings/api-keys/openrouter` accepts `{ apiKey?: string }` and
  returns `{ ok: true, configured: boolean }`; an empty key removes it.
- `GET /api/settings/openrouter/models` proxies `/models` and returns
  `{ models: [{ name, label }] }`, or an empty list on failure.
- `GET /api/settings/openrouter/status` returns
  `{ ok: true, model_count }` or `{ ok: false, error }`.

Chat uses the OpenAI chat adapter with the OpenRouter client. Summarization and
translation report `openrouter` as their billing mode and preserve token usage
reported by the upstream API.
