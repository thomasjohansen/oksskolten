import { describe, expect, it } from 'vitest'
import { getSummaryHealth } from './summary-section'

describe('getSummaryHealth', () => {
  it('maps persisted plugin health into the summary counters', () => {
    expect(getSummaryHealth({ plugin_id: 'omos.summary', enabled: true, pending: 1, running: 0, failed: 1, dead: 0, succeeded: 1 })).toEqual({ pending: 1, running: 0, failed: 1, succeeded: 1 })
  })

  it('returns an empty health snapshot when no imports have been processed', () => {
    expect(getSummaryHealth({ plugin_id: 'omos.summary', enabled: false, pending: 0, running: 0, failed: 0, dead: 0, succeeded: 0 })).toEqual({ pending: 0, running: 0, failed: 0, succeeded: 0 })
  })
})
