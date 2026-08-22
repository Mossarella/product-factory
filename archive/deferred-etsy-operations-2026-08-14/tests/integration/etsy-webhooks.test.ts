import { beforeEach, describe, expect, it, mock } from 'bun:test'

const OWNER_ID = 'owner-a'
const CONNECTION_ID = 'connection-a'
const SHOP_ID = 123456789

const connection = { id: CONNECTION_ID, owner_id: OWNER_ID, shop_id: SHOP_ID, status: 'connected' }
const secret = {
  connection_id: CONNECTION_ID,
  access_token_ciphertext: 'access-ciphertext',
  refresh_token_ciphertext: 'refresh-ciphertext',
  access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
}

type WebhookEvent = {
  id: string
  owner_id: string
  connection_id: string
  delivery_id: string
  event_type: string
  shop_id: number
  status: 'received' | 'processed' | 'ignored' | 'failed'
  payload: Record<string, unknown>
  error_message: string | null
}

type TestState = {
  events: WebhookEvent[]
  nextEventId: number
  syncCalls: number
  inventoryUpserts: number
  listingError: Error | null
}

let state: TestState

function rowsForTable(table: string) {
  if (table === 'etsy_connections') return [connection]
  if (table === 'etsy_connection_secrets') return [secret]
  if (table === 'etsy_webhook_events') return state.events
  return []
}

function createQuery(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  let payload: Record<string, unknown> | null = null
  const builder: Record<string, unknown> = {
    select: mock(() => builder),
    eq: mock((column: string, value: unknown) => {
      filters.push({ column, value })
      return builder
    }),
    maybeSingle: mock(async () => {
      const row = rowsForTable(table).find((candidate) => filters.every(({ column, value }) => candidate[column as keyof typeof candidate] === value)) ?? null
      return { data: row, error: null }
    }),
    single: mock(async () => {
      if (table === 'etsy_webhook_events' && payload) {
        const event: WebhookEvent = {
          id: `event-${state.nextEventId++}`,
          owner_id: String(payload.owner_id),
          connection_id: String(payload.connection_id),
          delivery_id: String(payload.delivery_id),
          event_type: String(payload.event_type),
          shop_id: Number(payload.shop_id),
          status: payload.status as WebhookEvent['status'],
          payload: payload.payload as Record<string, unknown>,
          error_message: null,
        }
        state.events.push(event)
        return { data: { id: event.id }, error: null }
      }
      const row = rowsForTable(table).find((candidate) => filters.every(({ column, value }) => candidate[column as keyof typeof candidate] === value)) ?? null
      return row ? { data: row, error: null } : { data: null, error: new Error(`No ${table} row`) }
    }),
    insert: mock((value: Record<string, unknown>) => {
      payload = value
      return builder
    }),
    update: mock((value: Record<string, unknown>) => {
      const matching = rowsForTable(table).filter((candidate) => filters.every(({ column, value: filterValue }) => candidate[column as keyof typeof candidate] === filterValue))
      for (const row of matching) Object.assign(row, value)
      return builder
    }),
    upsert: mock(async (values: Array<Record<string, unknown>>) => {
      if (table === 'etsy_inventory_items') state.inventoryUpserts += values.length
      return { data: null, error: null }
    }),
  }
  return builder
}

const admin = { from: mock((table: string) => createQuery(table)) }

mock.module('@/lib/etsy/oauth', () => ({
  createEtsyAdminClient: () => admin,
  decryptSecret: mock(() => 'access-token'),
  encryptSecret: mock((value: string) => `encrypted:${value}`),
  fetchEtsyShopListings: mock(async () => {
    state.syncCalls += 1
    if (state.listingError) throw state.listingError
    return [{ listing_id: 7, title: 'Inventory Item', state: 'active', skus: ['SKU-7'], price: { amount: 500, divisor: 100, currency_code: 'USD' } }]
  }),
  fetchEtsyListingInventory: mock(async () => ({ products: [{ sku: ['SKU-7'], offerings: [{ quantity: 3, is_enabled: true, price: { amount: 500, divisor: 100, currency_code: 'USD' } }] }] })),
  getEtsyConfig: () => ({ apiKeystring: 'key', sharedSecret: 'secret', redirectUri: 'http://localhost/callback', allowedShopId: String(SHOP_ID), scopes: ['listings_r'] }),
  getEtsyWebhookSigningSecret: () => 'signing-secret',
  refreshEtsyToken: mock(async () => ({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh', expires_in: 3600 })),
  verifyEtsyWebhookSignature: mock(({ webhookSignature }: { webhookSignature: string }) => webhookSignature === 'valid'),
}))

const { POST: receiveWebhook } = await import('@/app/api/integrations/etsy/webhooks/route')

function webhookRequest(payload: Record<string, unknown>, options: { id?: string; signature?: string } = {}) {
  return new Request('http://localhost/api/integrations/etsy/webhooks', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'webhook-id': options.id ?? 'delivery-1',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': options.signature ?? 'valid',
    },
  })
}

beforeEach(() => {
  state = { events: [], nextEventId: 1, syncCalls: 0, inventoryUpserts: 0, listingError: null }
})

describe('Etsy webhook route', () => {
  it('rejects missing or invalid signatures before reading shop data', async () => {
    const response = await receiveWebhook(webhookRequest({ event_type: 'order.paid', shop_id: SHOP_ID }, { signature: 'invalid' }))
    expect(response.status).toBe(401)
    expect(state.events).toHaveLength(0)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('acknowledges unsupported events without refreshing inventory', async () => {
    const response = await receiveWebhook(webhookRequest({ event_type: 'listing.updated', shop_id: SHOP_ID }, { id: 'delivery-unsupported' }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ accepted: true, status: 'ignored', eventType: 'listing.updated' })
    expect(state.events[0]?.status).toBe('ignored')
    expect(state.syncCalls).toBe(0)
  })

  it('refreshes inventory for a supported paid-order event and records processing', async () => {
    const response = await receiveWebhook(webhookRequest({ event_type: 'order.paid', shop_id: SHOP_ID, resource_url: 'https://openapi.etsy.com/receipt/1' }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ accepted: true, status: 'processed', itemsSeen: 1, itemsUpserted: 1 })
    expect(state.events[0]?.status).toBe('processed')
    expect(state.syncCalls).toBe(1)
    expect(state.inventoryUpserts).toBe(1)
  })

  it('returns a duplicate response without refreshing the inventory twice', async () => {
    state.events.push({ id: 'event-existing', owner_id: OWNER_ID, connection_id: CONNECTION_ID, delivery_id: 'delivery-duplicate', event_type: 'order.paid', shop_id: SHOP_ID, status: 'processed', payload: {}, error_message: null })
    const response = await receiveWebhook(webhookRequest({ event_type: 'order.paid', shop_id: SHOP_ID }, { id: 'delivery-duplicate' }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ accepted: true, duplicate: true, status: 'processed' })
    expect(state.syncCalls).toBe(0)
  })

  it('rejects a webhook for a shop that is not connected', async () => {
    const response = await receiveWebhook(webhookRequest({ event_type: 'order.paid', shop_id: 999 }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Webhook shop is not connected', code: 'WEBHOOK_SHOP_NOT_CONNECTED' })
    expect(state.events).toHaveLength(0)
  })

  it('records a failed processing event and returns a retryable error', async () => {
    state.listingError = new Error('Etsy API unavailable')
    const response = await receiveWebhook(webhookRequest({ event_type: 'order.canceled', shop_id: SHOP_ID }, { id: 'delivery-failed' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Etsy API unavailable', code: 'WEBHOOK_PROCESSING_FAILED' })
    expect(state.events[0]?.status).toBe('failed')
    expect(state.events[0]?.error_message).toBe('Etsy API unavailable')
  })
})
