import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireJson } from '../auth.js'
import { getStaticPluginHealth, setStaticPluginEnabled, getAiLabelsAllowNewLabels, setAiLabelsAllowNewLabels } from '../plugins/controls.js'
import { parseOrBadRequest } from '../lib/validation.js'

const EnabledBody = z.object({ enabled: z.boolean() })

export async function pluginControlRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/plugins', async (_request, reply) => reply.send({ plugins: [getStaticPluginHealth('omos.summary'), getStaticPluginHealth('omos.relevance'), getStaticPluginHealth('omos.ai-labels')] }))
  const register = (path: string, id: 'omos.summary' | 'omos.relevance' | 'omos.ai-labels') => {
    api.get(path, async (_request, reply) => reply.send(getStaticPluginHealth(id)))
    api.patch(path, { preHandler: [requireJson] }, async (request, reply) => { const body = parseOrBadRequest(EnabledBody, request.body, reply); if (!body) return; setStaticPluginEnabled(id, body.enabled); reply.send(getStaticPluginHealth(id)) })
  }
  register('/api/settings/plugins/summary', 'omos.summary')
  register('/api/settings/plugins/relevance', 'omos.relevance')
  register('/api/settings/plugins/ai-labels', 'omos.ai-labels')
  api.patch('/api/settings/plugins/ai-labels/config', { preHandler: [requireJson] }, async (request, reply) => { const body = parseOrBadRequest(z.object({ allow_new_labels: z.boolean() }), request.body, reply); if (!body) return; setAiLabelsAllowNewLabels(body.allow_new_labels); reply.send({ ...getStaticPluginHealth('omos.ai-labels'), allow_new_labels: getAiLabelsAllowNewLabels() }) })
}
