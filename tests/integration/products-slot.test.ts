import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  ROOT: '/tmp/test-root',
  ASSETS_DIR: '/tmp/test-assets',
  MIME: { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' },
  resolveWithinRoot: (...segments: string[]) => `/tmp/test-root/${segments.join('/')}`,
  resolveWithin: (directory: string, ...segments: string[]) => `${directory}/${segments.join('/')}`,
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  assetPath: (name: string, ...segments: string[]) => `/tmp/test-assets/${name}/${segments.join('/')}`,
  decodeSegment: (segment: string) => decodeURIComponent(segment),
  sanitizeName: (name: string) => name.trim().replace(/[^\w\- ]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

const mockFindUnique = mock(() => Promise.resolve({ id: 'product-1' }))
mock.module('@/lib/db', () => ({
  prisma: { product: { findUnique: mockFindUnique } },
}))

const mockPutObject = mock(() => Promise.resolve())
const mockGetObject = mock<(key: string) => Promise<{ body: Buffer; contentType?: string } | null>>(
  () => Promise.resolve({ body: Buffer.from('fake-slot-data'), contentType: 'image/png' }),
)
const mockDeleteObject = mock(() => Promise.resolve())
const mockObjectExists = mock(() => Promise.resolve(false))
const mockCopyObjectsByPrefix = mock(() => Promise.resolve())
mock.module('@/lib/object-storage', () => ({
  putObject: mockPutObject,
  getObject: mockGetObject,
  deleteObject: mockDeleteObject,
  objectExists: mockObjectExists,
  copyObjectsByPrefix: mockCopyObjectsByPrefix,
  productKey: (productId: string, ...segments: string[]) => ['products', productId, ...segments].join('/'),
}))

const { DELETE, GET, POST } = await import('@/app/api/products/[name]/slot/[slot]/route')

const slotParams = (slot = 'etsy-hero') => Promise.resolve({ name: 'TestProduct', slot })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockClear()
  mockPutObject.mockClear()
  mockGetObject.mockClear()
  mockDeleteObject.mockClear()
  mockFindUnique.mockImplementation(() => Promise.resolve({ id: 'product-1' }))
  mockPutObject.mockImplementation(() => Promise.resolve())
  mockGetObject.mockImplementation(() => Promise.resolve({ body: Buffer.from('fake-slot-data'), contentType: 'image/png' }))
  mockDeleteObject.mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/products/[name]/slot/[slot]', () => {
  it('returns 400 for an invalid slot', async () => {
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/slot/not-a-real-slot'), { params: slotParams('not-a-real-slot') })
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero'), { params: slotParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero'), { params: slotParams() })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the slot object does not exist', async () => {
    mockGetObject.mockImplementation(() => Promise.resolve(null))
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero'), { params: slotParams() })
    expect(res.status).toBe(404)
  })

  it('returns the slot bytes with its content type', async () => {
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero'), { params: slotParams() })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(Buffer.from('fake-slot-data')))
  })
})

describe('POST /api/products/[name]/slot/[slot]', () => {
  it('returns 400 for an invalid slot', async () => {
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/slot/not-a-real-slot', { method: 'POST' }), { params: slotParams('not-a-real-slot') })
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'POST' }), { params: slotParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'POST' }), { params: slotParams() })
    expect(res.status).toBe(404)
  })

  it('uploads the slot and returns success', async () => {
    const req = new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', {
      method: 'POST',
      headers: { 'X-Filename': 'hero.png' },
      body: new Uint8Array([1, 2, 3]),
    })
    const res = await POST(req, { params: slotParams() })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockPutObject).toHaveBeenCalledWith('products/product-1/etsy-slots/etsy-hero', expect.any(Buffer), 'image/png')
  })

  it('returns 400 when writing the slot fails', async () => {
    mockPutObject.mockImplementation(() => { throw new Error('storage failed') })
    const req = new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'POST', body: 'slot data' })
    const res = await POST(req, { params: slotParams() })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/products/[name]/slot/[slot]', () => {
  it('returns 400 for an invalid slot', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/products/TestProduct/slot/not-a-real-slot', { method: 'DELETE' }), { params: slotParams('not-a-real-slot') })
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await DELETE(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'DELETE' }), { params: slotParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await DELETE(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'DELETE' }), { params: slotParams() })
    expect(res.status).toBe(404)
  })

  it('deletes the slot and returns success', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'DELETE' }), { params: slotParams() })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockDeleteObject).toHaveBeenCalledWith('products/product-1/etsy-slots/etsy-hero')
  })

  it('returns 400 when deleting the slot fails', async () => {
    mockDeleteObject.mockImplementation(() => { throw new Error('storage failed') })
    const res = await DELETE(new NextRequest('http://localhost/api/products/TestProduct/slot/etsy-hero', { method: 'DELETE' }), { params: slotParams() })
    expect(res.status).toBe(400)
  })
})
