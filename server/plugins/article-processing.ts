import { logger } from '../logger.js'
import { runSummaryJobs } from './summary.js'
import { runRelevanceJobs } from './relevance.js'
import { runAiLabelJobs } from './ai-labels.js'

const log = logger.child('article-processing')
const BATCH_SIZE = 10
const CONCURRENCY = 2
const MAX_PASSES = 3
const MAX_DRAIN_MS = 30_000

export interface ProcessingRunOptions {
  batchSize: number
  concurrency: number
}

type Runner = (options: ProcessingRunOptions) => Promise<number>

export interface ArticleProcessingCoordinatorOptions {
  summary?: Runner
  relevance?: Runner
  aiLabels?: Runner
  maxPasses?: number
  maxDrainMs?: number
}

export interface ArticleProcessingCoordinator {
  notify(): void
  recover(): void
  idle(): Promise<void>
  readonly passCount: number
}

/**
 * Coalesces import and recovery signals into short, leased queue drains.
 * The coordinator deliberately does not enqueue jobs: persistence owns that
 * responsibility, and this component only wakes the existing workers.
 */
export function createArticleProcessingCoordinator(options: ArticleProcessingCoordinatorOptions = {}): ArticleProcessingCoordinator {
  const runners: Array<[string, Runner]> = [
    ['Summary', options.summary ?? (runSummaryJobs as Runner)],
    ['Relevance', options.relevance ?? (runRelevanceJobs as Runner)],
    ['AI Labels', options.aiLabels ?? (runAiLabelJobs as Runner)],
  ]
  const maxPasses = Math.max(1, options.maxPasses ?? MAX_PASSES)
  const maxDrainMs = Math.max(1, options.maxDrainMs ?? MAX_DRAIN_MS)
  let pending = false
  let running = false
  let passCount = 0
  let drainPromise: Promise<void> | null = null
  const waiters: Array<() => void> = []

  const finishIfIdle = () => {
    if (!running && !pending) {
      for (const resolve of waiters.splice(0)) resolve()
    }
  }

  const drain = async () => {
    if (running) return
    running = true
    passCount = 0
    const deadline = Date.now() + maxDrainMs
    try {
      while (pending && passCount < maxPasses && Date.now() < deadline) {
        pending = false
        passCount++
        for (const [name, runner] of runners) {
          try {
            await runner({ batchSize: BATCH_SIZE, concurrency: CONCURRENCY })
          } catch (error) {
            log.error(`${name} processing drain failed:`, error)
          }
        }
      }
      // Signals arriving after the safety bounds are intentionally left for
      // the five-minute recovery schedule rather than extending this drain.
      pending = false
    } finally {
      running = false
      drainPromise = null
      finishIfIdle()
    }
  }

  const signal = () => {
    pending = true
    if (!running && !drainPromise) {
      drainPromise = drain()
    }
  }

  return {
    notify: signal,
    recover: signal,
    idle: async () => {
      if (drainPromise) await drainPromise
      while (running || pending) await new Promise<void>(resolve => waiters.push(resolve))
    },
    get passCount() { return passCount },
  }
}

export const articleProcessingCoordinator = createArticleProcessingCoordinator()

export function notifyArticleContentPersisted(): void {
  articleProcessingCoordinator.notify()
}

export function recoverArticleProcessing(): void {
  articleProcessingCoordinator.recover()
}
