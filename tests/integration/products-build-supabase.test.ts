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
let events: Array<Record<string, unknown>> = []
let storedObjects = new Map<string, Buffer>()
let removedPaths: string[] = []
let uploadErrorMessage: string | null = null
let insertErrorMessage: string | null = null
let updateErrorMessage: string | null = null
let telemetryErrorMessage: string | null = null

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
      if (table === 'product_events') state.rows = events
      return chain
    }),
    order: mock(() => chain),
    limit: mock(() => chain),
    maybeSingle: mock(() => Promise.resolve({ data: table === 'product_builds' ? (builds[0] ?? null) : state.single, error: null })),
    insert: mock((row: Record<string, unknown> | Array<Record<string, unknown>>) => {
      if (table === 'product_events') {
        if (telemetryErrorMessage) return Promise.resolve({ data: null, error: new Error(telemetryErrorMessage) })
        events.push(...(Array.isArray(row) ? row : [row]))
        return Promise.resolve({ data: null, error: null })
      }
      if (insertErrorMessage) return Promise.resolve({ data: null, error: new Error(insertErrorMessage) })
      builds.push(row as Record<string, unknown>)
      return Promise.resolve({ data: null, error: null })
    }),
    update: mock((patch: Record<string, unknown>) => {
      if (updateErrorMessage) {
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: new Error(updateErrorMessage!) }).then(resolve)
        return chain
      }
      Object.assign(product, patch)
      return chain
    }),
    delete: mock(() => {
      if (table === 'product_builds') builds = builds.filter((row) => row.version !== 1)
      return chain
    }),
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
        upload: async (path: string, body: Buffer) => {
          if (uploadErrorMessage) return { data: null, error: new Error(uploadErrorMessage) }
          storedObjects.set(path, body)
          return { data: { path }, error: null }
        },
        remove: async (paths: string[]) => {
          removedPaths.push(...paths)
          paths.forEach((path) => storedObjects.delete(path))
          return { data: paths, error: null }
        },
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
  events = []
  storedObjects = new Map()
  removedPaths = []
  uploadErrorMessage = null
  insertErrorMessage = null
  updateErrorMessage = null
  telemetryErrorMessage = null
})

describe('Supabase packaging workflow', () => {
  it('builds, stores, persists, and downloads the latest ZIP', async () => {
    const buildResponse = await POST(new NextRequest('http://localhost/api/products/TestProduct/build', { method: 'POST', body: JSON.stringify({ notes: 'Initial package' }) }), context)
    expect(buildResponse.status).toBe(200)
    expect(await buildResponse.json()).toMatchObject({ version: 1, changelog: 'Initial package' })
    expect(builds).toHaveLength(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event_type: 'package_created' })
    expect(storedObjects.size).toBe(1)

    const downloadResponse = await GET_LATEST(new Request('http://localhost/api/products/TestProduct/build/latest'), context)
    expect(downloadResponse.status).toBe(200)
    expect(downloadResponse.headers.get('Content-Type')).toBe('application/zip')
    expect(await downloadResponse.arrayBuffer()).toEqual(Buffer.from('zip-bytes').buffer)
  })

  it('cleans up nothing when ZIP upload fails', async () => {
    uploadErrorMessage = 'storage unavailable'
    const response = await POST(new Request('http://localhost/api/products/TestProduct/build', { method: 'POST' }), context)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'storage unavailable' })
    expect(removedPaths).toEqual([])
    expect(builds).toHaveLength(0)
  })

  it('removes the uploaded ZIP when build persistence fails', async () => {
    insertErrorMessage = 'database unavailable'
    const response = await POST(new Request('http://localhost/api/products/TestProduct/build', { method: 'POST' }), context)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'database unavailable' })
    expect(removedPaths).toEqual(['user-test-123/product-1/builds/v1.zip'])
    expect(storedObjects.size).toBe(0)
    expect(builds).toHaveLength(0)
  })

  it('removes the uploaded ZIP and inserted row when version update fails', async () => {
    updateErrorMessage = 'product update unavailable'
    const response = await POST(new Request('http://localhost/api/products/TestProduct/build', { method: 'POST' }), context)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'product update unavailable' })
    expect(removedPaths).toEqual(['user-test-123/product-1/builds/v1.zip'])
    expect(storedObjects.size).toBe(0)
    expect(builds).toHaveLength(0)
  })

  it('does not fail a valid package when telemetry recording fails', async () => {
    telemetryErrorMessage = 'telemetry unavailable'
    const response = await POST(new Request('http://localhost/api/products/TestProduct/build', { method: 'POST' }), context)
    expect(response.status).toBe(200)
    expect(builds).toHaveLength(1)
    expect(storedObjects.size).toBe(1)
    expect(events).toHaveLength(0)
  })

  it('rejects the workflow before reading product data when unauthenticated', async () => {
    currentUser = null
    const response = await POST(new Request('http://localhost/api/products/TestProduct/build', { method: 'POST' }), context)
    expect(response.status).toBe(401)
  })
})
