import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))

const mockDeleteObjectsByPrefix = mock(() => Promise.resolve())
mock.module('@/lib/object-storage', () => ({
  deleteObjectsByPrefix: mockDeleteObjectsByPrefix,
  productKey: (productId: string, ...segments: string[]) => ['products', productId, ...segments].join('/'),
}))

const mockFindUnique = mock(() => Promise.resolve(null))
const mockDelete = mock(() => Promise.resolve(null))
mock.module('@/lib/db', () => ({
  prisma: {
    product: { findUnique: mockFindUnique, delete: mockDelete },
  },
}))

const { DELETE } = await import('@/app/api/products/[name]/route')

const existingProduct = () => ({
  id: 'product-1',
  userId: MOCK_USER.id,
  name: 'MyProduct',
})

const request = () => new NextRequest('http://localhost/api/products/MyProduct', { method: 'DELETE' })

const params = (name = 'MyProduct') => ({ params: Promise.resolve({ name }) })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockDeleteObjectsByPrefix.mockReset()
  mockFindUnique.mockReset()
  mockDelete.mockReset()
  mockDeleteObjectsByPrefix.mockReturnValue(Promise.resolve())
  mockFindUnique.mockResolvedValue(null)
  mockDelete.mockResolvedValue(existingProduct())
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('DELETE /api/products/[name]', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await DELETE(request(), params())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    const res = await DELETE(request(), params())
    expect(res.status).toBe(404)
  })

  it('deletes object storage and the DB row, returning ok: true', async () => {
    mockFindUnique.mockResolvedValue(existingProduct())

    const res = await DELETE(request(), params())

    expect(res.status).toBe(200)
    expect(mockDeleteObjectsByPrefix).toHaveBeenCalledWith('products/product-1/')
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'product-1' } })
    expect(await res.json()).toEqual({ ok: true })
  })
})
