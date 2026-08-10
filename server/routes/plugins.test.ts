import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'

beforeEach(() => setupTestDb())

describe('static plugin controls API', () => {
  it('returns health for all static modules and persists enablement', async () => {
    const app = await buildApp()
    const health = await app.inject({ method: 'GET', url: '/api/settings/plugins' })
    expect(health.statusCode).toBe(200)
    expect(health.json().plugins).toHaveLength(3)
    const disabled = await app.inject({ method: 'PATCH', url: '/api/settings/plugins/ai-labels', payload: { enabled: false } })
    expect(disabled.json()).toMatchObject({ plugin_id: 'omos.ai-labels', enabled: false })
    await app.close()
  })

  it('accepts and returns a versioned Balanced profile', async () => {
    const app = await buildApp()
    const profile = { version: 1, name: 'Balanced', weights: { evidence_credibility: 0.2, public_significance: 0.2, information_value: 0.2, constructive_positive_impact: 0.15, clickbait_penalty: 0.1, paywall_penalty: 0.075, distressing_conflict_war_penalty: 0.075 } }
    const response = await app.inject({ method: 'PUT', url: '/api/settings/plugins/relevance/profile', payload: { profile } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ profile, revision: 1, configured: true })
    await app.close()
  })
})
