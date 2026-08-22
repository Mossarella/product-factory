import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  sanitizeName: (name: string) => name.trim().replace(/[^\w\- ]/g, ''),
}))

const mockPutObject = mock(() => Promise.resolve())
const mockGetObject = mock(() => Promise.resolve())
const mockDeleteObject = mock(() => Promise.resolve())
const mockCopyObjectsByPrefix = mock(() => Promise.resolve())
const mockObjectExists = mock(() => Promise.resolve())
mock.module('@/lib/object-storage', () => ({
  putObject: mockPutObject,
  getObject: mockGetObject,
  deleteObject: mockDeleteObject,
  copyObjectsByPrefix: mockCopyObjectsByPrefix,
  objectExists: mockObjectExists,
  productKey: (productId: string, ...segments: string[]) => ['products', productId, ...segments].join('/'),
}))

const mockFindUnique = mock(() => Promise.resolve(null))
const mockUpdate = mock(() => Promise.resolve(null))
mock.module('@/lib/db', () => ({
  prisma: {
    product: { findUnique: mockFindUnique, update: mockUpdate },
  },
}))

const { POST } = await import('@/app/api/products/[name]/rename/route')

const sourceProduct = () => ({
  id: 'product-source',
  userId: MOCK_USER.id,
  name: 'Source Product',
  sku: 'SKU-1',
  productName: 'Source Product Name',
  etsyTitle: 'Source Etsy Title',
  description: 'Description',
  notes: 'Notes',
  contact: 'Contact',
  price: 12.5,
  currency: 'USD',
  licenseType: 'personal',
  commercialPrice: null,
  folders: ['Main'],
  etsyTags: ['tag'],
  complete: true,
  createdAt: new Date('2025-01-01'),
  files: [],
})

const renamedProduct = () => ({ ...sourceProduct(), name: 'Renamed Product' })

const request = (newName: string) => new NextRequest('http://localhost/api/products/Source%20Product/rename', {
  method: 'POST',
  body: JSON.stringify({ newName }),
  headers: { 'Content-Type': 'application/json' },
})

const params = (name = 'Source%20Product') => ({ params: Promise.resolve({ name }) })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockPutObject.mockReset()
  mockGetObject.mockReset()
  mockDeleteObject.mockReset()
  mockCopyObjectsByPrefix.mockReset()
  mockObjectExists.mockReset()
  mockFindUnique.mockReset()
  mockUpdate.mockReset()
  mockPutObject.mockReturnValue(Promise.resolve())
  mockGetObject.mockReturnValue(Promise.resolve())
  mockDeleteObject.mockReturnValue(Promise.resolve())
  mockCopyObjectsByPrefix.mockReturnValue(Promise.resolve())
  mockObjectExists.mockReturnValue(Promise.resolve())
  mockFindUnique.mockResolvedValue(null)
  mockUpdate.mockResolvedValue(renamedProduct())
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/products/[name]/rename', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null

    const res = await POST(request('Renamed Product'), params())

    expect(res.status).toBe(401)
  })

  it('returns 400 when the new name sanitizes to empty', async () => {
    const res = await POST(request('!!!'), params())

    expect(res.status).toBe(400)
  })

  it('returns 404 when the source product does not exist', async () => {
    const res = await POST(request('Renamed Product'), params())

    expect(res.status).toBe(404)
  })

  it('returns 409 when the new name already exists', async () => {
    let calls = 0
    mockFindUnique.mockImplementation(() => Promise.resolve(calls++ === 0 ? sourceProduct() : renamedProduct()))

    const res = await POST(request('Renamed Product'), params())

    expect(res.status).toBe(409)
  })

  it('renames the product in the database and returns the new name', async () => {
    let calls = 0
    mockFindUnique.mockImplementation(() => Promise.resolve(calls++ === 0 ? sourceProduct() : null))
    mockUpdate.mockResolvedValue(renamedProduct())

    const res = await POST(request('  Renamed Product  '), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Renamed Product' })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'product-source' },
      data: { name: 'Renamed Product' },
      include: { files: true },
    })
  })

  it('performs no object-storage operations during a successful rename', async () => {
    let calls = 0
    mockFindUnique.mockImplementation(() => Promise.resolve(calls++ === 0 ? sourceProduct() : null))

    const res = await POST(request('Renamed Product'), params())

    expect(res.status).toBe(200)
    expect(mockPutObject).not.toHaveBeenCalled()
    expect(mockGetObject).not.toHaveBeenCalled()
    expect(mockDeleteObject).not.toHaveBeenCalled()
    expect(mockCopyObjectsByPrefix).not.toHaveBeenCalled()
    expect(mockObjectExists).not.toHaveBeenCalled()
  })
})
