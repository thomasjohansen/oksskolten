import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireJson } from '../auth.js'
import { parseOrBadRequest } from '../lib/validation.js'
import { getReprocessRun, reprocessArticles, REPROCESS_MAX_LIMIT } from '../plugins/reprocess.js'

const Body = z.object({ modules: z.array(z.enum(['summary', 'relevance', 'ai_labels'])).min(1), limit: z.number().int().min(1).max(REPROCESS_MAX_LIMIT).optional() })

export async function reprocessRoutes(api: FastifyInstance): Promise<void> {
  api.post('/api/internal/reprocess', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(Body, request.body, reply)
    if (!body) return
    reply.send(reprocessArticles(body))
  })
  api.get('/api/internal/reprocess/:runId', async (request, reply) => {
    const runId = (request.params as { runId: string }).runId
    const run = getReprocessRun(runId)
    if (!run) return reply.status(404).send({ error: 'Reprocess run not found' })
    return run
  })
}
