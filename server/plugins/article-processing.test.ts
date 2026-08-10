import { describe, expect, it, vi } from 'vitest'
import { createArticleProcessingCoordinator } from './article-processing.js'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

describe('article processing coordinator', () => {
  it('coalesces notifications, never overlaps, and allows one follow-up pass', async () => {
    let release!: () => void
    const firstPass = new Promise<void>(resolve => { release = resolve })
    const summary = vi.fn().mockImplementationOnce(() => firstPass).mockResolvedValue(0)
    const coordinator = createArticleProcessingCoordinator({ summary, relevance: vi.fn(), aiLabels: vi.fn() })

    coordinator.notify()
    coordinator.notify()
    await tick()
    expect(summary).toHaveBeenCalledTimes(1)
    coordinator.notify()
    coordinator.notify()
    release()
    await coordinator.idle()

    expect(summary).toHaveBeenCalledTimes(2)
    expect(summary.mock.calls[0][0]).toMatchObject({ batchSize: 10, concurrency: 2 })
  })

  it('isolates plugin failures and shares the recovery gate', async () => {
    const summary = vi.fn().mockRejectedValue(new Error('summary failed'))
    const relevance = vi.fn().mockResolvedValue(1)
    const aiLabels = vi.fn().mockResolvedValue(1)
    const coordinator = createArticleProcessingCoordinator({ summary, relevance, aiLabels })

    coordinator.recover()
    await coordinator.idle()

    expect(summary).toHaveBeenCalledTimes(1)
    expect(relevance).toHaveBeenCalledTimes(1)
    expect(aiLabels).toHaveBeenCalledTimes(1)
    expect(relevance.mock.calls[0][0]).toMatchObject({ batchSize: 10, concurrency: 2 })
  })

  it('bounds the number of follow-up passes', async () => {
    const coordinator = createArticleProcessingCoordinator({
      summary: vi.fn().mockImplementation(async () => { coordinator.notify(); return 0 }),
      relevance: vi.fn().mockResolvedValue(0),
      aiLabels: vi.fn().mockResolvedValue(0),
      maxPasses: 2,
    })

    coordinator.notify()
    await coordinator.idle()
    expect(coordinator.passCount).toBe(2)
  })
})
