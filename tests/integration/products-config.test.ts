import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

// Mock auth and prisma before importing the route
mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  ROOT: '/tmp/test-root',
  ASSETS_DIR: '/tmp/test-assets',
  MIME: { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' },
  resolveWithinRoot: (...segments: string[]) => `/tmp/test-root/${segments.join('/')}`,
  resolveWithin: (directory: string, ...segments: string[]) => `${directory}/${segments.join('/')}`,
  assetPath: (name: string, ...segments: string[]) => `/tmp/test-assets/${name}/${segments.join('/')}`,
  decodeSegment: (segment: string) => decodeURIComponent(segment),
  sanitizeName: (name: string) => name.trim().replace(/[^\w\- ]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

const mockFindUnique = mock(() => Promise.resolve(null))
const mockUpsert = mock(() => Promise.resolve({ id: 'product-1' }))
const mockMascotDeleteMany = mock(() => Promise.resolve({ count: 0 }))
const mockMascotCreateMany = mock(() => Promise.resolve({ count: 0 }))
const mockFixedAssetDeleteMany = mock(() => Promise.resolve({ count: 0 }))
const mockFixedAssetCreateMany = mock(() => Promise.resolve({ count: 0 }))

mock.module('@/lib/db', () => ({
  prisma: {
    product: { findUnique: mockFindUnique, upsert: mockUpsert },
    mascotFile: { deleteMany: mockMascotDeleteMany, createMany: mockMascotCreateMany },
    fixedAssetFile: { deleteMany: mockFixedAssetDeleteMany, createMany: mockFixedAssetCreateMany },
  },
}))

const { GET, POST } = await import('@/app/api/products/[name]/config/route')

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'TestProduct',
    sku: '',
    productName: 'Test Product',
    etsyTitle: '',
    description: '',
    notes: '',
    contact: '',
    price: 0,
    currency: 'USD',
    licenseType: 'personal',
    commercialPrice: null,
    folders: ['Main'],
    etsyTags: [],
    templateId: null,
    complete: false,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    files: [],
    fixedAssetFiles: [],
    builds: [],
    ...overrides,
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/products/TestProduct/config', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const context = { params: Promise.resolve({ name: 'TestProduct' }) }

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockClear()
  mockUpsert.mockClear()
  mockMascotDeleteMany.mockClear()
  mockMascotCreateMany.mockClear()
  mockFixedAssetDeleteMany.mockClear()
  mockFixedAssetCreateMany.mockClear()
  mockUpsert.mockReturnValue(Promise.resolve(product()))
  mockFindUnique.mockReturnValue(Promise.resolve(product()))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/products/[name]/config', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/config'), context)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/config'), context)
    expect(res.status).toBe(404)
  })

  it('returns fixed asset files from the product', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({
      fixedAssetFiles: [{ id: 'fa1', assetKey: 'thankyou', filename: 'thankyou.png', origName: 'my-thankyou.png' }],
      files: [],
    })))

    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/config'), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fixedAssetFiles[0]).toEqual({
      id: 'fa1', assetKey: 'thankyou', filename: 'thankyou.png', origName: 'my-thankyou.png',
    })
  })
})

describe('POST /api/products/[name]/config', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(request({}), context)
    expect(res.status).toBe(401)
  })

  it('creates submitted fixed asset files', async () => {
    const res = await POST(request({
      fixedAssetFiles: [
        { assetKey: 'thankyou', filename: 'thankyou.png', origName: 'my-thankyou.png' },
        { assetKey: 'license', filename: 'license.pdf', origName: 'my-license.pdf' },
      ],
    }), context)

    expect(res.status).toBe(200)
    expect(mockFixedAssetCreateMany.mock.calls[0][0]).toEqual({
      data: [
        { productId: 'product-1', assetKey: 'thankyou', filename: 'thankyou.png', origName: 'my-thankyou.png' },
        { productId: 'product-1', assetKey: 'license', filename: 'license.pdf', origName: 'my-license.pdf' },
      ],
    })
  })

  it('clears fixed asset files without creating replacements when an empty array is sent', async () => {
    const res = await POST(request({ fixedAssetFiles: [] }), context)

    expect(res.status).toBe(200)
    expect(mockFixedAssetDeleteMany.mock.calls[0][0]).toEqual({ where: { productId: 'product-1' } })
    expect(mockFixedAssetCreateMany).not.toHaveBeenCalled()
  })

  it('returns fixed asset files from the final product fetch', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({
      fixedAssetFiles: [{ id: 'fa1', assetKey: 'thankyou', filename: 'thankyou.png', origName: 'my-thankyou.png' }],
    })))

    const res = await POST(request({ fixedAssetFiles: [] }), context)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fixedAssetFiles).toEqual([
      { id: 'fa1', assetKey: 'thankyou', filename: 'thankyou.png', origName: 'my-thankyou.png' },
    ])
  })
})
