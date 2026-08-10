import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireJson } from '../auth.js'
import { getStaticPluginHealth, isStaticPluginEnabled, setStaticPluginEnabled } from '../plugins/controls.js'
import { getRelevanceProfile, setRelevanceProfile } from '../plugins/relevance.js'
import { parseOrBadRequest } from '../lib/validation.js'

const EnabledBody = z.object({ enabled: z.boolean() })

export async function pluginControlRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/plugins', async (_request, reply) => reply.send({ plugins: [getStaticPluginHealth('omos.summary'), getStaticPluginHealth('omos.relevance'), getStaticPluginHealth('omos.topics')] }))
  const register = (path: string, id: 'omos.summary' | 'omos.relevance' | 'omos.topics') => {
    api.get(path, async (_request, reply) => reply.send(getStaticPluginHealth(id)))
    api.patch(path, { preHandler: [requireJson] }, async (request, reply) => { const body = parseOrBadRequest(EnabledBody, request.body, reply); if (!body) return; setStaticPluginEnabled(id, body.enabled); reply.send(getStaticPluginHealth(id)) })
  }
  register('/api/settings/plugins/summary', 'omos.summary')
  register('/api/settings/plugins/relevance', 'omos.relevance')
  register('/api/settings/plugins/topics', 'omos.topics')
  api.get('/api/settings/plugins/relevance/profile', async (_request, reply) => reply.send({ ...getRelevanceProfile(), enabled: isStaticPluginEnabled('omos.relevance') }))
  api.put('/api/settings/plugins/relevance/profile', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(z.object({ profile: z.unknown() }), request.body, reply)
    if (!body) return
    const revision = setRelevanceProfile(body.profile)
    reply.send({ ...getRelevanceProfile(), revision, enabled: isStaticPluginEnabled('omos.relevance') })
  })
}
