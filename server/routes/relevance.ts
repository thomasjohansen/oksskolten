import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getRelevanceBrief, setRelevanceBrief, getArticleRelevance } from '../plugins/relevance.js'
import { requireJson } from '../auth.js'
import { parseOrBadRequest } from '../lib/validation.js'
import { getArticleById } from '../db.js'

const BriefBody = z.object({ brief: z.string() })

export async function relevanceRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/relevance', async (_request, reply) => reply.send(getRelevanceBrief()))
  api.put('/api/settings/relevance', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(BriefBody, request.body, reply)
    if (!body) return
    const revision = setRelevanceBrief(body.brief)
    reply.send({ ...getRelevanceBrief(), revision })
  })
  api.get('/api/articles/:id/relevance', async (request, reply) => {
    const params = parseOrBadRequest(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
    if (!params) return
    if (!getArticleById(params.id)) return reply.status(404).send({ error: 'Article not found' })
    reply.send({ relevance: getArticleRelevance(params.id) })
  })
}
