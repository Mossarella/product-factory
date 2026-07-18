import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_SESSION = { user: { id: 'user-test-123', email: 'test@example.com' } }
const OTHER_USER_ID = 'other-user-456'
const RULES = [{ id: 'r1', type: 'field_present', label: 'Has notes', required: true, field: 'notes' }]
const TEMPLATE = { id: 't1', name: 'Test Template', assets: ['readme'], rules: RULES }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  ROOT: '/tmp/test-root',
  PRODUCTS_DIR: '/tmp/test-products',
  ASSETS_DIR: '/tmp/test-assets',
  AVATARS_DIR: '/tmp/test-avatars',
  MIME: { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' },
  resolveWithinRoot: (...segments: string[]) => `/tmp/test-root/${segments.join('/')}`,
  resolveWithin: (directory: string, ...segments: string[]) => `${directory}/${segments.join('/')}`,
  productPath: (name: string, ...segments: string[]) => `/tmp/test-products/${name}/${segments.join('/')}`,
  userProductPath: (userId: string, name: string, ...segments: string[]) => `/tmp/test-products/${userId}/${name}/${segments.join('/')}`,
  assetPath: (name: string, ...segments: string[]) => `/tmp/test-assets/${name}/${segments.join('/')}`,
  avatarPath: (userId: string) => `/tmp/test-avatars/${userId}`,
  decodeSegment: (segment: string) => decodeURIComponent(segment),
  sanitizeName: (n: string) => n.replace(/[^a-zA-Z0-9-_]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  clearDirectory: () => {},
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))
mock.module('fs', () => ({
  default: { mkdirSync: () => {}, readFileSync: () => JSON.stringify({ plan: 'pro' }) },
  mkdirSync: () => {},
  readFileSync: () => JSON.stringify({ plan: 'pro' }),
}))

const mockFindMany = mock(() => Promise.resolve([]))
const mockCreate = mock(() => Promise.resolve(TEMPLATE))
const mockFindUnique = mock(() => Promise.resolve(null))
const mockUpdate = mock(() => Promise.resolve(TEMPLATE))
const mockDelete = mock(() => Promise.resolve(TEMPLATE))

mock.module('@/lib/db', () => ({
  prisma: {
    productTemplate: {
      findMany: mockFindMany,
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}))

const { GET, POST } = await import('@/app/api/product-templates/route')
const { GET: GET_ONE, PUT, DELETE: DELETE_ONE } = await import('@/app/api/product-templates/[id]/route')

const params = (id = 't1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockFindMany.mockReset()
  mockCreate.mockReset()
  mockFindUnique.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
  mockFindMany.mockResolvedValue([])
  mockCreate.mockResolvedValue(TEMPLATE)
  mockFindUnique.mockResolvedValue(null)
  mockUpdate.mockResolvedValue(TEMPLATE)
  mockDelete.mockResolvedValue(TEMPLATE)
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/product-templates', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns an empty array when no templates exist', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /api/product-templates', () => {
  it('returns 400 for a missing name', async () => {
    const req = new NextRequest('http://localhost/api/product-templates', {
      method: 'POST', body: JSON.stringify({ assets: [] }), headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates a template with rules and returns 201', async () => {
    const req = new NextRequest('http://localhost/api/product-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Template', assets: ['readme'], rules: RULES }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect((await res.json()).rules).toEqual(RULES)
  })
})

describe('GET /api/product-templates/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await GET_ONE(new NextRequest('http://localhost/api/product-templates/t1'), params())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the template does not exist', async () => {
    const res = await GET_ONE(new NextRequest('http://localhost/api/product-templates/missing'), params('missing'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the template belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({ ...TEMPLATE, userId: OTHER_USER_ID })
    const res = await GET_ONE(new NextRequest('http://localhost/api/product-templates/t1'), params())
    expect(res.status).toBe(404)
  })

  it('returns a template including its rules', async () => {
    mockFindUnique.mockResolvedValue({ ...TEMPLATE, userId: MOCK_SESSION.user.id })
    const res = await GET_ONE(new NextRequest('http://localhost/api/product-templates/t1'), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(TEMPLATE)
  })
})

describe('PUT /api/product-templates/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const req = new NextRequest('http://localhost/api/product-templates/t1', { method: 'PUT', body: '{}' })
    const res = await PUT(req, params())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the template belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({ userId: OTHER_USER_ID })
    const req = new NextRequest('http://localhost/api/product-templates/t1', { method: 'PUT', body: '{}' })
    const res = await PUT(req, params())
    expect(res.status).toBe(404)
  })

  it('updates rules when provided', async () => {
    mockFindUnique.mockResolvedValue({ userId: MOCK_SESSION.user.id })
    const req = new NextRequest('http://localhost/api/product-templates/t1', {
      method: 'PUT', body: JSON.stringify({ rules: RULES }), headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, params())
    expect(res.status).toBe(200)
    expect(mockUpdate.mock.calls[0][0]).toEqual(expect.objectContaining({ data: expect.objectContaining({ rules: RULES }) }))
  })
})

describe('DELETE /api/product-templates/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await DELETE_ONE(new NextRequest('http://localhost/api/product-templates/t1', { method: 'DELETE' }), params())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the template belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({ userId: OTHER_USER_ID })
    const res = await DELETE_ONE(new NextRequest('http://localhost/api/product-templates/t1', { method: 'DELETE' }), params())
    expect(res.status).toBe(404)
  })

  it('deletes an owned template and returns 204', async () => {
    mockFindUnique.mockResolvedValue({ userId: MOCK_SESSION.user.id })
    const res = await DELETE_ONE(new NextRequest('http://localhost/api/product-templates/t1', { method: 'DELETE' }), params())
    expect(res.status).toBe(204)
  })
})
