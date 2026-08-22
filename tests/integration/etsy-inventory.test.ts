import { beforeEach, describe, expect, it, mock } from 'bun:test'

const OWNER_ID = 'owner-a'
const OTHER_OWNER_ID = 'owner-b'
const PRODUCT_ID = 'product-a'
const ITEM_ID = 'inventory-a'
const CONNECTION_ID = 'connection-a'

const state = {
  user: { id: OWNER_ID } as { id: string } | null,
  syncs: [] as Array<Record<string, unknown>>,
  items: [] as Array<Record<string, unknown>>,
  matches: [] as Array<Record<string, unknown>>,
  listingCalls: 0,
  inventoryCalls: 0,
  syncError: null as Error | null,
}

const product = { id: PRODUCT_ID, owner_id: OWNER_ID, name: 'Sample Product', product_name: 'Sample Product' }
const connection = { id: CONNECTION_ID, owner_id: OWNER_ID, shop_id: 123, status: 'connected' }
const secret = { connection_id: CONNECTION_ID, access_token_ciphertext: 'access', refresh_token_ciphertext: 'refresh', access_token_expires_at: new Date(Date.now() + 3600_000).toISOString() }

function rows(table: string) {
  if (table === 'products') return [product]
  if (table === 'etsy_connections') return [connection]
  if (table === 'etsy_connection_secrets') return [secret]
  if (table === 'etsy_inventory_items') return state.items
  if (table === 'etsy_inventory_syncs') return state.syncs
  if (table === 'etsy_product_matches') return state.matches
  return []
}

function createQuery(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  let operation: 'read' | 'insert' | 'update' | 'upsert' | 'delete' = 'read'
  let payload: Record<string, unknown> | Array<Record<string, unknown>> | null = null
  const matches = () => rows(table).filter((row) => filters.every(({ column, value }) => row[column] === value))
  const execute = () => {
    if (operation === 'delete') {
      const keep = rows(table).filter((row) => !filters.every(({ column, value }) => row[column] === value))
      if (table === 'etsy_product_matches') state.matches = keep
      return { data: null, error: null }
    }
    if (operation === 'update') {
      for (const row of matches()) Object.assign(row, payload)
      return { data: matches(), error: null }
    }
    if (operation === 'upsert' && table === 'etsy_inventory_items') {
      for (const incoming of (Array.isArray(payload) ? payload : [payload])) {
        const existing = state.items.find((row) => row.connection_id === incoming.connection_id && row.etsy_listing_id === incoming.etsy_listing_id)
        if (existing) Object.assign(existing, incoming)
        else state.items.push({ id: `item-${state.items.length + 1}`, ...incoming })
      }
      return { data: state.items, error: null }
    }
    if (operation === 'upsert' && table === 'etsy_product_matches') {
      const incoming = payload as Record<string, unknown>
      const existing = state.matches.find((row) => row.inventory_item_id === incoming.inventory_item_id || row.product_id === incoming.product_id)
      if (existing) Object.assign(existing, incoming)
      else state.matches.push({ id: `match-${state.matches.length + 1}`, created_at: 'now', updated_at: 'now', ...incoming })
      return { data: state.matches.at(-1), error: null }
    }
    return { data: matches(), error: null }
  }
  const builder: Record<string, unknown> = {
    select: mock(() => builder),
    eq: mock((column: string, value: unknown) => { filters.push({ column, value }); return builder }),
    order: mock(() => builder),
    limit: mock(() => builder),
    or: mock(() => builder),
    maybeSingle: mock(async () => ({ data: matches()[0] ?? null, error: null })),
    single: mock(async () => {
      if (operation === 'insert' && table === 'etsy_inventory_syncs') {
        const sync = { id: `sync-${state.syncs.length + 1}`, ...payload }
        state.syncs.push(sync)
        return { data: sync, error: null }
      }
      if (operation === 'upsert' && table === 'etsy_product_matches') return { data: execute().data, error: null }
      return { data: matches()[0] ?? null, error: null }
    }),
    insert: mock((value: Record<string, unknown>) => { operation = 'insert'; payload = value; return builder }),
    update: mock((value: Record<string, unknown>) => { operation = 'update'; payload = value; return builder }),
    upsert: mock((value: Record<string, unknown> | Array<Record<string, unknown>>) => { operation = 'upsert'; payload = value; return builder }),
    delete: mock(() => { operation = 'delete'; return builder }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
  }
  return builder
}

const admin = { from: mock((table: string) => createQuery(table)) }
const client = { auth: { getUser: mock(async () => ({ data: { user: state.user } })) }, from: mock((table: string) => createQuery(table)) }

mock.module('@/lib/supabase/server', () => ({ createClient: async () => client }))
mock.module('@/lib/entitlements', () => ({
  EntitlementError: class EntitlementError extends Error {},
  getEntitlement: async () => ({ tier: 'creator', productLimit: 500, storageLimitBytes: 5 * 1024 * 1024 * 1024, maxFileBytes: 100 * 1024 * 1024, etsyEnabled: true, releaseRetention: 3, productCount: 1, storageUsedBytes: 0 }),
  assertPaidFeature: () => undefined,
  entitlementErrorResponse: () => null,
}))
mock.module('@/lib/etsy/oauth', () => ({
  createEtsyAdminClient: () => admin,
  decryptSecret: mock((value: string) => value),
  encryptSecret: mock((value: string) => `encrypted:${value}`),
  getEtsyConfig: () => ({ apiKeystring: 'key', sharedSecret: 'secret', redirectUri: 'http://localhost/callback', allowedShopId: '123', scopes: ['listings_r'] }),
  refreshEtsyToken: mock(async () => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })),
  fetchEtsyShopListings: mock(async () => {
    state.listingCalls += 1
    if (state.syncError) throw state.syncError
    return [{ listing_id: 77, title: 'Blue Wall Paint', state: 'active', skus: ['WALL-001'], price: { amount: 1200, divisor: 100, currency_code: 'USD' } }]
  }),
  fetchEtsyListingInventory: mock(async () => {
    state.inventoryCalls += 1
    return { products: [{ sku: ['WALL-001'], offerings: [{ quantity: 3, is_enabled: true, price: { amount: 1200, divisor: 100, currency_code: 'USD' } }] }] }
  }),
}))

const { POST: syncInventory } = await import('@/app/api/integrations/etsy/inventory/sync/route')
const { GET: getInventory } = await import('@/app/api/integrations/etsy/inventory/route')
const { POST: matchInventory } = await import('@/app/api/integrations/etsy/inventory/[id]/match/route')

beforeEach(() => {
  state.user = { id: OWNER_ID }
  state.syncs = []
  state.items = [{ id: ITEM_ID, owner_id: OWNER_ID, connection_id: CONNECTION_ID, etsy_listing_id: 77, title: 'Blue Wall Paint', state: 'active', sku: 'WALL-001', price: 12, quantity: 3, currency: 'USD', last_synced_at: 'now' }]
  state.matches = []
  state.listingCalls = 0
  state.inventoryCalls = 0
  state.syncError = null
})

describe('Etsy inventory sync and matching', () => {
  it('fetches Etsy listings, normalizes inventory, and records a completed sync', async () => {
    const response = await syncInventory(new Request('http://localhost', { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'completed', itemsSeen: 1, itemsUpserted: 1 })
    expect(state.listingCalls).toBe(1)
    expect(state.inventoryCalls).toBe(1)
    expect(state.items[0]).toMatchObject({ etsy_listing_id: 77, sku: 'WALL-001', quantity: 3, price: 12 })
  })

  it('returns only owner-scoped cached inventory', async () => {
    const response = await getInventory(new Request('http://localhost/api/integrations/etsy/inventory?q=Blue'))
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveLength(1)
    state.user = { id: OTHER_OWNER_ID }
    const otherResponse = await getInventory(new Request('http://localhost/api/integrations/etsy/inventory'))
    expect(otherResponse.status).toBe(200)
    expect(await otherResponse.json()).toHaveLength(0)
  })

  it('manually matches an owned Etsy listing to an owned Product Factory product', async () => {
    const response = await matchInventory(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ productId: PRODUCT_ID }) }), { params: Promise.resolve({ id: ITEM_ID }) })
    expect(response.status).toBe(200)
    expect(state.matches[0]).toMatchObject({ owner_id: OWNER_ID, product_id: PRODUCT_ID, inventory_item_id: ITEM_ID, match_method: 'manual' })
  })

  it('does not allow another owner to match the cached Etsy listing', async () => {
    state.user = { id: OTHER_OWNER_ID }
    const response = await matchInventory(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ productId: PRODUCT_ID }) }), { params: Promise.resolve({ id: ITEM_ID }) })
    expect(response.status).toBe(404)
    expect(state.matches).toHaveLength(0)
  })
})
