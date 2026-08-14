import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { setupTestDb } from '../__tests__/helpers/testDb.js'

beforeEach(() => setupTestDb())

describe('static plugin controls API', () => {
  it('returns health and enablement for Relevance without exposing profile configuration routes', async () => {
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/settings/plugins/relevance' })).json()).toMatchObject({ plugin_id: 'omos.relevance', enabled: true })
    expect((await app.inject({ method: 'PATCH', url: '/api/settings/plugins/relevance', payload: { enabled: false } })).json()).toMatchObject({ plugin_id: 'omos.relevance', enabled: false })
    expect((await app.inject({ method: 'GET', url: '/api/settings/plugins/relevance/profile' })).statusCode).toBe(404)
    await app.close()
  })
})
