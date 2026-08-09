import type { FastifyInstance } from 'fastify'
import { getArticleById } from '../db.js'
import { getArticleTopics } from '../plugins/topics.js'
import { parseOrBadRequest } from '../lib/validation.js'
import { z } from 'zod'

export async function topicsRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/articles/:id/topics', async (request, reply) => {
    const params = parseOrBadRequest(z.object({ id: z.coerce.number().int().positive() }), request.params, reply)
    if (!params) return
    if (!getArticleById(params.id)) return reply.status(404).send({ error: 'Article not found' })
    reply.send({ topics: getArticleTopics(params.id) })
  })
}
