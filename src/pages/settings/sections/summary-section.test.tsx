import { describe, expect, it } from 'vitest'
import { getSummaryHealth } from './summary-section'

describe('getSummaryHealth', () => {
  it('prioritizes active and failed jobs while reporting completed work', () => {
    expect(getSummaryHealth([
      { status: 'succeeded' },
      { status: 'pending' },
      { status: 'failed' },
    ])).toEqual({ pending: 1, running: 0, failed: 1, succeeded: 1 })
  })

  it('returns an empty health snapshot when no imports have been processed', () => {
    expect(getSummaryHealth([])).toEqual({ pending: 0, running: 0, failed: 0, succeeded: 0 })
  })
})
