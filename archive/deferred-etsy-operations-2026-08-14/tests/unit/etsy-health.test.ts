import { describe, expect, it } from 'bun:test'
import { buildEtsyHealthPayload } from '@/lib/etsy/health'

describe('Etsy health payloads', () => {
  it('reports healthy only when Supabase and Etsy are healthy', () => {
    const payload = buildEtsyHealthPayload({
      checkedAt: '2026-08-14T00:00:00.000Z',
      supabase: { status: 'healthy', latencyMs: 12 },
      etsy: { status: 'healthy', latencyMs: 91 },
      connection: { shopName: 'Product Factory', shopId: '123', tokenExpiresAt: '2026-08-14T01:00:00.000Z' },
    })

    expect(payload.status).toBe('healthy')
    expect(payload.checks.etsy.latencyMs).toBe(91)
    expect(JSON.stringify(payload)).not.toContain('access_token')
    expect(JSON.stringify(payload)).not.toContain('refresh_token')
  })

  it('reports degraded when either dependency is unavailable', () => {
    const payload = buildEtsyHealthPayload({
      supabase: { status: 'healthy' },
      etsy: { status: 'degraded', message: 'Etsy API health check failed' },
    })

    expect(payload.status).toBe('degraded')
    expect(payload.checks.etsy.message).toBe('Etsy API health check failed')
  })

  it('reports unconfigured when the shop has not been connected', () => {
    const payload = buildEtsyHealthPayload({
      supabase: { status: 'healthy', latencyMs: 8 },
      etsy: { status: 'unconfigured', message: 'No connected Etsy shop' },
    })

    expect(payload.status).toBe('unconfigured')
  })
})
