import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getLabels, getLabelById, createLabel, updateLabel, deleteLabel, getArticlesByLabel, promoteAiLabel, dismissAiLabel, mergeAiLabel } from '../db.js'
import { requireJson } from '../auth.js'
import { NumericIdParams, parseOrBadRequest } from '../lib/validation.js'

const MatchField = z.enum(['title', 'full_text', 'both'])
const RuleType = z.enum(['and', 'or', 'not'])

const LabelRule = z.object({
  match_text: z.string().trim().min(1),
  match_field: MatchField.default('both'),
  rule_type: RuleType.default('or'),
})

const CreateLabelBody = z.object({
  name: z.string({ error: 'name is required' }).trim().min(1, 'name is required'),
  auto_summarize: z.boolean().default(false),
  exclusive: z.boolean().default(false),
  rules: z.array(LabelRule).min(1, 'at least one rule is required'),
})

const UpdateLabelBody = z.object({
  name: z.string().trim().min(1).optional(),
  sort_order: z.number().int().optional(),
  auto_summarize: z.boolean().optional(),
  exclusive: z.boolean().optional(),
  rules: z.array(LabelRule).optional(),
})

const LabelArticlesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  unread: z.string().optional(),
})

export async function labelRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/labels', async (request, reply) => {
    const query = request.query as Record<string, string>
    reply.send({ labels: getLabels({ unreadOnly: query.unread === '1', includeCandidates: query.include_candidates === '1' }) })
  })

  api.post('/api/labels/:id/promote', { preHandler: [requireJson] }, async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const label = promoteAiLabel(params.id)
    if (!label) { reply.status(400).send({ error: 'Only AI candidates can be promoted' }); return }
    reply.send(label)
  })

  api.post('/api/labels/:id/dismiss', { preHandler: [requireJson] }, async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const label = dismissAiLabel(params.id)
    if (!label) { reply.status(400).send({ error: 'Only AI candidates can be dismissed' }); return }
    reply.send(label)
  })

  api.post('/api/labels/:id/merge', { preHandler: [requireJson] }, async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const body = parseOrBadRequest(z.object({ target_label_id: z.coerce.number().int().positive() }), request.body, reply)
    if (!body) return
    try { reply.send(mergeAiLabel(params.id, body.target_label_id)) }
    catch (error) { reply.status(400).send({ error: error instanceof Error ? error.message : String(error) }) }
  })

  api.get('/api/labels/:id', async (request, reply) => {
    const params = parseOrBadRequest(NumericIdParams, request.params, reply)
    if (!params) return
    const label = getLabelById(params.id)
    if (!label) {
      reply.status(404).send({ error: 'Label not found' })
      return
    }
    reply.send(label)
  })

  api.post(
    '/api/labels',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(CreateLabelBody, request.body, reply)
      if (!body) return
      const label = createLabel(body)
      reply.status(201).send(label)
    },
  )

  api.patch(
    '/api/labels/:id',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const body = parseOrBadRequest(UpdateLabelBody, request.body, reply)
      if (!body) return
      if (body.rules?.length === 0 && getLabelById(params.id)?.origin !== 'ai') {
        reply.status(400).send({ error: 'Manual labels require at least one rule' })
        return
      }
      const label = updateLabel(params.id, body)
      if (!label) {
        reply.status(404).send({ error: 'Label not found' })
        return
      }
      reply.send(label)
    },
  )

  api.delete(
    '/api/labels/:id',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      const deleted = deleteLabel(params.id)
      if (!deleted) {
        reply.status(404).send({ error: 'Label not found' })
        return
      }
      reply.status(204).send()
    },
  )

  api.get(
    '/api/labels/:id/articles',
    async (request, reply) => {
      const params = parseOrBadRequest(NumericIdParams, request.params, reply)
      if (!params) return
      if (!getLabelById(params.id)) {
        reply.status(404).send({ error: 'Label not found' })
        return
      }
      const query = parseOrBadRequest(LabelArticlesQuery, request.query, reply)
      if (!query) return
      const unreadOnly = query.unread === '1'
      const result = getArticlesByLabel(params.id, { limit: query.limit, offset: query.offset, unreadOnly })
      reply.send({
        articles: result.items,
        total: result.total,
        has_more: result.hasMore,
      })
    },
  )
}
