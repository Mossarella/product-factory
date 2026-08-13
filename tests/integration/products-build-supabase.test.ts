import { beforeEach, describe, expect, it, mock } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = 'user-test-123'
const PRODUCT_ID = 'product-1'
let currentUser: { id: string } | null = { id: USER_ID }
let product = {
  id: PRODUCT_ID,
  owner_id: USER_ID,
  name: 'TestProduct',
  sku: 'TEST-001',
  product_name: 'Test Product',
  etsy_title: 'Test Etsy Listing',
  description: 'A test product',
  notes: '',
  contact: 'shop@example.com',
  price: 12,
  currency: 'USD',
  license_type: 'personal',
  commercial_price: null,
  folders: ['Main'],
  etsy_tags: ['test'],
  template_id: null,
  complete: true,
  build_version: 0,
  created_at: '2026-01-01T00:00:00.000Z',
}
let builds: Array<Record<string, unknown>> = []
let storedObjects = new Map<string, Buffer>()

const manifest = { version: 1, productName: 'Test Product', builtAt: '2026-01-01T00:00:00.000Z', files: [], fixedAssets: [], template: null, validation: null, warnings: [] }

mock.module('@/lib/zip-server', () => ({
  buildZipBuffer: mock(async () => ({ buffer: Buffer.from('zip-bytes'), manifest })),
}))

function builder(table: string) {
  const state: { rows: unknown; single: unknown } = { rows: null, single: null }
  const chain: Record<string, any> = {
    select: mock(() => chain),
    eq: mock((column: string, value: unknown) => {
      if (table === 'products' && column === 'owner_id' && value === USER_ID) state.single = product
      if (table === 'products' && column === 'name' && value === product.name) state.single = product
      if (table === 'products' && column === 'id' && value === PRODUCT_ID) state.single = product
      if (table === 'product_files') state.rows = []
      if (table === 'fixed_asset_files') state.rows = []
      if (table === 'profiles') state.single = { display_name: 'Test User', shop_name: 'Test Shop', shop_contact: null, shop_description: null, readme_footer: null }
      if (table === 'product_builds') state.rows = builds
      return chain
    }),
    order: mock(() => chain),
    limit: mock(() => chain),
    maybeSingle: mock(() => Promise.resolve({ data: table === 'product_builds' ? (builds[0] ?? null) : state.single, error: null })),
    insert: mock((row: Record<string, unknown>) => { builds.push(row); return Promise.resolve({ data: null, error: null }) }),
    update: mock((patch: Record<string, unknown>) => { Object.assign(product, patch); return chain }),
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.rows ?? (table === 'product_builds' ? builds : []), error: null }).then(resolve)
  return chain
}

mock.module('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer) => { storedObjects.set(path, body); return { data: { path }, error: null } },
        download: async (path: string) => storedObjects.has(path) ? { data: new Blob([storedObjects.get(path)!]), error: null } : { data: null, error: new Error('missing') },
      }),
    },
  }),
}))

const { POST } = await import('@/app/api/products/[name]/build/route')
const { GET: GET_LATEST } = await import('@/app/api/products/[name]/build/latest/route')
const context = { params: Promise.resolve({ name: 'TestProduct' }) }

beforeEach(() => {
  currentUser = { id: USER_ID }
  product = { ...product, build_version: 0 }
  builds = []
  storedObjects = new Map()
})

describe('Supabase packaging workflow', () => {
  it('builds, stores, persists, and downloads the latest ZIP', async () => {
    const buildResponse = await POST(new NextRequest('http://localhost/api/products/TestProduct/build', { method: 'POST', body: JSON.stringify({ notes: 'Initial package' }) }), context)
    expect(buildResponse.status).toBe(200)
    expect(await buildResponse.json()).toMatchObject({ version: 1, changelog: 'Initial package' })
    expect(builds).toHaveLength(1)
    expect(storedObjects.size).toBe(1)

    const downloadResponse = await GET_LATEST(new Request('http://localhost/api/products/TestProduct/build/latest'), context)
    expect(downloadResponse.status).toBe(200)
    expect(downloadResponse.headers.get('Content-Type')).toBe('application/zip')
    expect(await downloadResponse.arrayBuffer()).toEqual(Buffer.from('zip-bytes').buffer)
  })

  it('rejects the workflow before reading product data when unauthenticated', async () => {
    currentUser = null
    const response = await POST(new Request('http://localhost/api/products/TestProduct/build', { method: 'POST' }), context)
    expect(response.status).toBe(401)
  })
})
