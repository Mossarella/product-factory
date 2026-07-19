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
  sanitizeName: (n: string) => n.replace(/[^a-zA-Z0-9-_]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

const mockFindMany = mock(() => Promise.resolve([]))
const mockCount = mock(() => Promise.resolve(0))
const mockFindUnique = mock(() => Promise.resolve(null))
const mockUserFindUnique = mock(() => Promise.resolve({ plan: 'pro' }))
const mockCreate = mock(() => Promise.resolve({
  name: 'TestProduct',
  sku: '', productName: 'TestProduct', etsyTitle: '',
  description: '', notes: '', contact: '', price: 0, currency: 'USD',
  licenseType: 'personal', commercialPrice: null,
  folders: ['Main'], etsyTags: [], complete: false,
  createdAt: new Date(), files: [],
}))

mock.module('@/lib/db', () => ({
  prisma: {
    product: { findMany: mockFindMany, count: mockCount, findUnique: mockFindUnique, create: mockCreate },
    user: { findUnique: mockUserFindUnique },
  },
}))

const { GET, POST } = await import('@/app/api/products/route')

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockUserFindUnique.mockClear()
  mockUserFindUnique.mockReturnValue(Promise.resolve({ plan: 'pro' }))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/products', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns empty array when no products', async () => {
    mockFindMany.mockReturnValue(Promise.resolve([]))
    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns products list', async () => {
    mockFindMany.mockReturnValue(Promise.resolve([
      { name: 'ProductA', complete: false, createdAt: new Date('2025-01-01') },
    ]))
    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('ProductA')
  })
})

describe('POST /api/products', () => {
  it('returns 400 for missing name', async () => {
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates a product and returns 201', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    mockCount.mockReturnValue(Promise.resolve(0))
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestProduct' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('TestProduct')
  })

  it('returns 403 when a free-plan user has reached the 3-product limit', async () => {
    mockUserFindUnique.mockReturnValue(Promise.resolve({ plan: 'free' }))
    mockCount.mockReturnValue(Promise.resolve(3))
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestProduct' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('limit')
  })

  it('allows creating a 4th product for a pro-plan user', async () => {
    mockUserFindUnique.mockReturnValue(Promise.resolve({ plan: 'pro' }))
    mockCount.mockReturnValue(Promise.resolve(3))
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestProduct' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })
})
