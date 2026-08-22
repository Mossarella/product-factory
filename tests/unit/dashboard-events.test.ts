import { describe, expect, it } from 'bun:test'
import { aggregateDashboardEvents } from '@/lib/dashboard-events'

describe('aggregateDashboardEvents()', () => {
  it('counts successful packages and reused assets and selects the latest package', () => {
    expect(aggregateDashboardEvents([
      { eventType: 'package_created', createdAt: '2026-08-01T10:00:00.000Z', metadata: { version: 1 } },
      { eventType: 'asset_reused', createdAt: '2026-08-01T10:00:01.000Z', metadata: { asset_key: 'readme' } },
      { eventType: 'asset_reused', createdAt: '2026-08-01T10:00:02.000Z', metadata: { asset_key: 'thank-you' } },
      { eventType: 'package_created', createdAt: '2026-08-03T10:00:00.000Z', metadata: { version: 2 } },
    ])).toEqual({
      productsPackaged: 2,
      filesReused: 2,
      lastExport: '2026-08-03T10:00:00.000Z',
    })
  })

  it('returns an empty telemetry state when no events exist', () => {
    expect(aggregateDashboardEvents([])).toEqual({ productsPackaged: 0, filesReused: 0, lastExport: null })
  })
})
