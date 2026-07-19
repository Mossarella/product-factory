import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: () => 'application/octet-stream',
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buffer: ArrayBuffer) => Buffer.from(buffer)),
}))

const mockFindUnique = mock(() => Promise.resolve({ id: 'product-1' }))
mock.module('@/lib/db', () => ({
  prisma: { product: { findUnique: mockFindUnique } },
}))

const mockPutObject = mock(() => Promise.resolve())
const mockGetObject = mock<(key: string) => Promise<{
  body: Buffer
  contentType?: string
  metadata?: { filename?: string }
} | null>>(() => Promise.resolve({ body: Buffer.from('scene-bytes') }))
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

const { GET, POST } = await import('@/app/api/products/[name]/veado/route')

const params = () => Promise.resolve({ name: 'TestProduct' })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockImplementation(() => Promise.resolve({ id: 'product-1' }))
  mockPutObject.mockImplementation(() => Promise.resolve())
  mockGetObject.mockImplementation(() => Promise.resolve({ body: Buffer.from('scene-bytes') }))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/products/[name]/veado', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/veado'), { params: params() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/veado'), { params: params() })
    expect(res.status).toBe(404)
  })

  it('returns 404 when no veado object exists', async () => {
    mockGetObject.mockImplementation(() => Promise.resolve(null))
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/veado'), { params: params() })
    expect(res.status).toBe(404)
  })

  it('returns the filename stored in object metadata', async () => {
    mockGetObject.mockImplementation(() => Promise.resolve({
      body: Buffer.from('scene-bytes'),
      metadata: { filename: 'my-scene.veado' },
    }))
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/veado'), { params: params() })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Filename')).toBe('my-scene.veado')
  })

  it('falls back to scene.veado when the object has no metadata', async () => {
    const res = await GET(new NextRequest('http://localhost/api/products/TestProduct/veado'), { params: params() })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Filename')).toBe('scene.veado')
  })
})

describe('POST /api/products/[name]/veado', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/veado', { method: 'POST' }), { params: params() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/veado', { method: 'POST' }), { params: params() })
    expect(res.status).toBe(404)
  })

  it('uploads the veado file with its sanitized filename in metadata', async () => {
    const req = new NextRequest('http://localhost/api/products/TestProduct/veado', {
      method: 'POST',
      headers: { 'X-Filename': 'my scene!.veado' },
      body: 'scene-bytes',
    })
    const res = await POST(req, { params: params() })

    expect(res.status).toBe(200)
    expect(mockPutObject.mock.calls[0][3]).toEqual({ filename: 'myscene.veado' })
  })

  it('returns 400 when the upload throws', async () => {
    mockPutObject.mockImplementation(() => { throw new Error('storage failure') })
    const req = new NextRequest('http://localhost/api/products/TestProduct/veado', {
      method: 'POST',
      body: 'scene-bytes',
    })
    const res = await POST(req, { params: params() })

    expect(res.status).toBe(400)
  })
})
