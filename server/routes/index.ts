import type { FastifyInstance } from 'fastify'
import { requireAuth, requireWriteScope } from '../auth.js'
import { feedRoutes } from './feeds.js'
import { articleRoutes } from './articles.js'
import { categoryRoutes } from './categories.js'
import { settingsRoutes } from './settings.js'
import { adminRoutes } from './admin.js'
import { apiKeyRoutes } from './apiKeys.js'
import { statsRoutes } from './stats.js'
import { labelRoutes } from './labels.js'
import { summaryRoutes } from './summary.js'
import { relevanceRoutes } from './relevance.js'
import { topicsRoutes } from './topics.js'
import { reprocessRoutes } from './reprocess.js'
import { pluginControlRoutes } from './plugins.js'

export function registerApi(app: FastifyInstance): void {
  app.register(async function apiRoutes(api) {
    api.addHook('preHandler', requireAuth)
    api.addHook('preHandler', requireWriteScope)

    await api.register(feedRoutes)
    await api.register(articleRoutes)
    await api.register(categoryRoutes)
    await api.register(settingsRoutes)
    await api.register(adminRoutes)
    await api.register(apiKeyRoutes)
    await api.register(statsRoutes)
    await api.register(labelRoutes)
    await api.register(summaryRoutes)
    await api.register(relevanceRoutes)
    await api.register(topicsRoutes)
    await api.register(reprocessRoutes)
    await api.register(pluginControlRoutes)
  })
}
