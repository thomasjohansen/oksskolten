import type { FastifyInstance } from 'fastify'
import { listSummaryJobs, retrySummaryJob } from '../plugins/summary.js'

export async function summaryRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/internal/summary/jobs', async (request) => {
    const limit = Number((request.query as { limit?: string }).limit ?? 50)
    return { jobs: listSummaryJobs(Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 50) }
  })
  api.post('/api/internal/summary/jobs/:articleId/retry', async (request, reply) => {
    const articleId = Number((request.params as { articleId: string }).articleId)
    if (!Number.isInteger(articleId) || articleId < 1 || !retrySummaryJob(articleId)) {
      return reply.status(404).send({ error: 'Failed summary job not found' })
    }
    return { queued: true }
  })
}
