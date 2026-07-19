import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

const mockFindUnique = mock(() => Promise.resolve({ id: 'product-1' }))
mock.module('@/lib/db', () => ({
  prisma: { product: { findUnique: mockFindUnique } },
}))

const mockPutObject = mock(() => Promise.resolve())
const mockGetObject = mock<(key: string) => Promise<{ body: Buffer; contentType?: string } | null>>(
  () => Promise.resolve({ body: Buffer.from('fake-file-data'), contentType: 'image/png' }),
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

const { POST } = await import('@/app/api/products/[name]/file/route')
const { GET: GET_FILE } = await import('@/app/api/products/[name]/file/[filename]/route')

const uploadParams = () => Promise.resolve({ name: 'TestProduct' })
const fileParams = () => Promise.resolve({ name: 'TestProduct', filename: 'image.png' })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindUnique.mockImplementation(() => Promise.resolve({ id: 'product-1' }))
  mockPutObject.mockImplementation(() => Promise.resolve())
  mockGetObject.mockImplementation(() => Promise.resolve({ body: Buffer.from('fake-file-data'), contentType: 'image/png' }))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/products/[name]/file', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(new NextRequest('http://localhost/api/products/TestProduct/file', { method: 'POST' }), { params: uploadParams() })
    expect(res.status).toBe(401)
  })

  it('returns 413 when Content-Length exceeds 50MB', async () => {
    const req = new NextRequest('http://localhost/api/products/TestProduct/file', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png', 'Content-Length': String(50 * 1024 * 1024 + 1) },
      body: new Uint8Array([1]),
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain('50MB')
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const req = new NextRequest('http://localhost/api/products/TestProduct/file', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png' },
      body: new Uint8Array([1, 2, 3]),
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(404)
  })

  it('uploads a mascot file and returns success', async () => {
    const req = new NextRequest('http://localhost/api/products/TestProduct/file', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png' },
      body: new Uint8Array([1, 2, 3]),
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockPutObject).toHaveBeenCalledWith('products/product-1/mascot-files/image.png', expect.any(Buffer), 'image/png')
  })

  it('returns 400 when writing the mascot file fails', async () => {
    mockPutObject.mockImplementation(() => { throw new Error('storage error') })
    const req = new NextRequest('http://localhost/api/products/TestProduct/file', {
      method: 'POST',
      headers: { 'X-Filename': 'image.png' },
      body: 'file data',
    })
    const res = await POST(req, { params: uploadParams() })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/products/[name]/file/[filename]', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET_FILE(new NextRequest('http://localhost/api/products/TestProduct/file/image.png'), { params: fileParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await GET_FILE(new NextRequest('http://localhost/api/products/TestProduct/file/image.png'), { params: fileParams() })

    expect(res.status).toBe(404)
  })

  it('returns 404 when the mascot file does not exist', async () => {
    mockGetObject.mockImplementation(() => Promise.resolve(null))
    const res = await GET_FILE(new NextRequest('http://localhost/api/products/TestProduct/file/image.png'), { params: fileParams() })

    expect(res.status).toBe(404)
  })

  it('returns the mascot file with its content type and bytes', async () => {
    const res = await GET_FILE(new NextRequest('http://localhost/api/products/TestProduct/file/image.png'), { params: fileParams() })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(Buffer.from('fake-file-data')))
  })
})
