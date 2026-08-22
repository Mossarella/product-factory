import { beforeEach, describe, expect, it, mock } from 'bun:test'

const OWNER_ID = 'owner-a'
const OTHER_OWNER_ID = 'owner-b'
const PRODUCT_ID = 'product-a'
const RELEASE_ID = 'release-a'
const CONNECTION_ID = 'connection-a'
const VERSION = 3

const listingSnapshot = {
  productName: 'Sample Product',
  sku: 'SAMPLE-003',
  title: 'Sample Product',
  description: 'A downloadable sample product.',
  tags: ['sample', 'digital'],
  price: 4,
  currency: 'USD',
  licenseType: 'personal',
  commercialPrice: null,
}

const release = {
  id: RELEASE_ID,
  owner_id: OWNER_ID,
  product_id: PRODUCT_ID,
  build_id: 'build-a',
  version: VERSION,
  bundle_filename: 'Sample-Product-v3.zip',
  bundle_storage_path: 'owner-a/product-a/releases/v3/release.zip',
  listing_snapshot: listingSnapshot,
  release_summary: { version: VERSION },
}

const product = { id: PRODUCT_ID, owner_id: OWNER_ID, name: 'Sample Product' }
const connection = { id: CONNECTION_ID, owner_id: OWNER_ID, shop_id: 123456789, shop_name: 'Sample Shop', status: 'connected' }
const secret = {
  connection_id: CONNECTION_ID,
  access_token_ciphertext: 'access-ciphertext',
  refresh_token_ciphertext: 'refresh-ciphertext',
  access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
}

type Publication = {
  id: string
  owner_id: string
  connection_id: string
  release_id: string
  status: 'creating' | 'draft' | 'published' | 'failed'
  etsy_listing_id: number | null
  request_snapshot: Record<string, unknown>
  response_metadata: Record<string, unknown>
  error_message: string | null
}

type TestState = {
  user: { id: string } | null
  publications: Publication[]
  nextPublicationId: number
  draftCalls: number
  uploadCalls: number
  uploadError: Error | null
}

let state: TestState

function rowsForTable(table: string) {
  if (table === 'products') return [product]
  if (table === 'product_releases') return [release]
  if (table === 'etsy_connections') return [connection]
  if (table === 'etsy_connection_secrets') return [secret]
  if (table === 'etsy_release_publications') return state.publications
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
      if (table === 'etsy_release_publications' && payload) {
        const publication: Publication = {
          id: `publication-${state.nextPublicationId++}`,
          owner_id: String(payload.owner_id),
          connection_id: String(payload.connection_id),
          release_id: String(payload.release_id),
          status: payload.status as Publication['status'],
          etsy_listing_id: null,
          request_snapshot: payload.request_snapshot as Record<string, unknown>,
          response_metadata: {},
          error_message: null,
        }
        state.publications.push(publication)
        return { data: { id: publication.id }, error: null }
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
  }
  return builder
}

const admin = {
  from: mock((table: string) => createQuery(table)),
  storage: {
    from: mock(() => ({
      download: mock(async () => ({ data: new Blob(['release-zip']), error: null })),
    })),
  },
}

const userClient = {
  auth: { getUser: mock(async () => ({ data: { user: state.user } })) },
}

mock.module('@/lib/supabase/server', () => ({ createClient: async () => userClient }))
mock.module('@/lib/entitlements', () => ({
  EntitlementError: class EntitlementError extends Error {},
  getEntitlement: async () => ({ tier: 'creator', productLimit: 500, storageLimitBytes: 5 * 1024 * 1024 * 1024, maxFileBytes: 100 * 1024 * 1024, etsyEnabled: true, releaseRetention: 3, productCount: 1, storageUsedBytes: 0 }),
  assertPaidFeature: () => undefined,
  entitlementErrorResponse: () => null,
}))
mock.module('@/lib/etsy/oauth', () => ({
  createEtsyAdminClient: () => admin,
  createEtsyDraftListing: mock(async () => {
    state.draftCalls += 1
    return { listing_id: 987654321, title: listingSnapshot.title }
  }),
  uploadEtsyDigitalFile: mock(async () => {
    state.uploadCalls += 1
    if (state.uploadError) throw state.uploadError
    return { file_id: 456789 }
  }),
  decryptSecret: mock((value: string) => value.includes('refresh') ? 'refresh-token' : 'access-token'),
  encryptSecret: mock((value: string) => `encrypted:${value}`),
  getEtsyConfig: () => ({ apiKeystring: 'key', sharedSecret: 'secret', redirectUri: 'http://localhost/callback', allowedShopId: String(connection.shop_id), scopes: ['listings_r', 'listings_w', 'shops_r'] }),
  refreshEtsyToken: mock(async () => ({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh', expires_in: 3600 })),
}))

const { POST: createDraft } = await import('@/app/api/products/[name]/release/[version]/etsy-draft/route')

const params = { params: Promise.resolve({ name: 'Sample Product', version: String(VERSION) }) }

beforeEach(() => {
  state = { user: { id: OWNER_ID }, publications: [], nextPublicationId: 1, draftCalls: 0, uploadCalls: 0, uploadError: null }
})

describe('Etsy draft publication route', () => {
  it('creates a draft listing and uploads the immutable release ZIP', async () => {
    const response = await createDraft(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ taxonomyId: 123 }),
      headers: { 'content-type': 'application/json' },
    }), params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.created).toBe(true)
    expect(body.publication.status).toBe('draft')
    expect(body.publication.etsy_listing_id).toBe(987654321)
    expect(state.draftCalls).toBe(1)
    expect(state.uploadCalls).toBe(1)
    expect(state.publications[0]?.request_snapshot).toMatchObject({ taxonomyId: 123, type: 'download', state: 'draft' })
  })

  it('returns the existing draft without creating or uploading again', async () => {
    state.publications = [{
      id: 'publication-existing', owner_id: OWNER_ID, connection_id: CONNECTION_ID, release_id: RELEASE_ID,
      status: 'draft', etsy_listing_id: 987654321, request_snapshot: {}, response_metadata: {}, error_message: null,
    }]
    const response = await createDraft(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ taxonomyId: 123 }) }), params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.created).toBe(false)
    expect(body.publication.id).toBe('publication-existing')
    expect(state.draftCalls).toBe(0)
    expect(state.uploadCalls).toBe(0)
  })

  it('records a failed publication when Etsy ZIP upload fails', async () => {
    state.uploadError = new Error('Etsy upload rejected')
    const response = await createDraft(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ taxonomyId: 123 }) }), params)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toEqual({ error: 'Etsy upload rejected', code: 'ETSY_DRAFT_FAILED' })
    expect(state.publications[0]?.status).toBe('failed')
    expect(state.publications[0]?.error_message).toBe('Etsy upload rejected')
  })

  it('does not expose a release owned by another user', async () => {
    state.user = { id: OTHER_OWNER_ID }
    const response = await createDraft(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ taxonomyId: 123 }) }), params)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Product not found', code: 'PRODUCT_NOT_FOUND' })
    expect(state.draftCalls).toBe(0)
  })
})
