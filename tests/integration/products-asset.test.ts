import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

// Mock auth and file helpers before importing the routes
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
  () => Promise.resolve({ body: Buffer.from('fake-image-data'), contentType: 'image/png' }),
)
mock.module('@/lib/object-storage', () => ({
  putObject: mockPutObject,
  getObject: mockGetObject,
  productKey: (productId: string, ...segments: string[]) => ['products', productId, ...segments].join('/'),
}))

const { POST } = await import('@/app/api/products/[name]/asset/route')
const { GET: GET_ASSET } = await import('@/app/api/products/[name]/asset/[filename]/route')

const uploadParams = () => Promise.resolve({ name: 'TestProduct' })
const assetParams = () => Promise.resolve({ name: 'TestProduct', filename: 'image.png' })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockImplementation(() => Promise.resolve({ id: 'product-1' }))
  mockPutObject.mockImplementation(() => Promise.resolve())
  mockGetObject.mockImplementation(() => Promise.resolve({ body: Buffer.from('fake-image-data'), contentType: 'image/png' }))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/products/[name]/asset', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/asset', { method: 'POST' }), { params: uploadParams() })
    expect(res.status).toBe(401)
  })

  it('uploads an asset and returns success', async () => {
    const req = new NextRequest('http://localhost/api/products/TestProduct/asset', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png' },
      body: new Uint8Array([1, 2, 3]),
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockPutObject).toHaveBeenCalled()
  })

  it('returns 413 when Content-Length exceeds 50MB', async () => {
    mockPutObject.mockClear()
    const req = new NextRequest('http://localhost/api/products/TestProduct/asset', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png', 'Content-Length': String(50 * 1024 * 1024 + 1) },
      body: new Uint8Array([1]),
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain('50MB')
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  it('returns 400 when writing the asset fails', async () => {
    mockPutObject.mockImplementation(() => { throw new Error('disk full') })
    const req = new NextRequest('http://localhost/api/products/TestProduct/asset', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png' },
      body: 'image data',
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/products/[name]/asset/[filename]', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET_ASSET(new NextRequest('http://localhost/api/products/TestProduct/asset/image.png'), { params: assetParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the asset does not exist', async () => {
    mockGetObject.mockImplementation(() => Promise.resolve(null))
    const res = await GET_ASSET(new NextRequest('http://localhost/api/products/TestProduct/asset/image.png'), { params: assetParams() })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    const res = await GET_ASSET(new NextRequest('http://localhost/api/products/TestProduct/asset/image.png'), { params: assetParams() })
    expect(res.status).toBe(404)
  })

  it('returns the asset with its content type', async () => {
    const res = await GET_ASSET(new NextRequest('http://localhost/api/products/TestProduct/asset/image.png'), { params: assetParams() })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(await res.text()).toBe('fake-image-data')
  })
})
