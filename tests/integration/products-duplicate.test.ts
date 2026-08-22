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
  assetPath: (name: string, ...segments: string[]) => `/tmp/test-assets/${name}/${segments.join('/')}`,
  decodeSegment: (segment: string) => decodeURIComponent(segment),
  sanitizeName: (n: string) => n.replace(/[^a-zA-Z0-9-_]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

const mockPutObject = mock(() => Promise.resolve())
const mockGetObject = mock(() => Promise.resolve(null))
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

const mockFindUnique = mock(() => Promise.resolve(null))
const mockCreate = mock(() => Promise.resolve(null))
mock.module('@/lib/db', () => ({
  prisma: {
    product: { findUnique: mockFindUnique, create: mockCreate },
  },
}))

const { POST } = await import('@/app/api/products/[name]/duplicate/route')

const FIXED_ASSET = {
  id: 'fa1',
  assetKey: 'thankyou',
  filename: 'thankyou.png',
  origName: 'orig.png',
}

const sourceProduct = () => ({
  id: 'product-source',
  userId: MOCK_USER.id,
  name: 'SourceProduct',
  sku: 'SKU-1',
  productName: 'Source Product',
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
  templateId: 'tmpl_abc',
  complete: true,
  createdAt: new Date('2025-01-01'),
  files: [],
  fixedAssetFiles: [FIXED_ASSET],
})

const duplicatedProduct = () => ({
  ...sourceProduct(),
  id: 'product-duplicate',
  name: 'DuplicateProduct',
  complete: false,
})

const request = (newName: string) => new NextRequest('http://localhost/api/products/SourceProduct/duplicate', {
  method: 'POST',
  body: JSON.stringify({ newName }),
  headers: { 'Content-Type': 'application/json' },
})

const params = (name = 'SourceProduct') => ({ params: Promise.resolve({ name }) })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockCopyObjectsByPrefix.mockReset()
  mockFindUnique.mockReset()
  mockCreate.mockReset()
  mockCopyObjectsByPrefix.mockReturnValue(Promise.resolve())
  mockFindUnique.mockResolvedValue(null)
  mockCreate.mockResolvedValue(duplicatedProduct())
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/products/[name]/duplicate', () => {
  it('returns 401 when not authenticated', async () => {
    currentSession = null
    const res = await POST(request('DuplicateProduct'), params())
    expect(res.status).toBe(401)
  })

  it('returns 400 when newName is empty or invalid', async () => {
    const res = await POST(request('!@#$'), params())
    expect(res.status).toBe(400)
  })

  it('returns 404 when the source product does not exist', async () => {
    const res = await POST(request('DuplicateProduct'), params())
    expect(res.status).toBe(404)
  })

  it('copies template and fixed asset files into the duplicate', async () => {
    mockFindUnique.mockResolvedValue(sourceProduct())
    mockCreate.mockResolvedValue(duplicatedProduct())

    const res = await POST(request('DuplicateProduct'), params())

    expect(res.status).toBe(200)
    expect(mockCopyObjectsByPrefix).toHaveBeenCalledWith('products/product-source/', 'products/product-duplicate/')
    expect(mockCreate.mock.calls[0][0].data.templateId).toBe('tmpl_abc')
    expect(mockCreate.mock.calls[0][0].data.fixedAssetFiles.create).toEqual([
      { assetKey: 'thankyou', filename: 'thankyou.png', origName: 'orig.png' },
    ])

    const body = await res.json()
    expect(body.templateId).toBe('tmpl_abc')
    expect(body.fixedAssetFiles).toEqual([FIXED_ASSET])
  })

  it('returns the duplicated product JSON body on success', async () => {
    mockFindUnique.mockResolvedValue(sourceProduct())

    const res = await POST(request('DuplicateProduct'), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      name: 'DuplicateProduct',
      sku: 'SKU-1',
      productName: 'Source Product',
      etsyTitle: 'Source Etsy Title',
      description: 'Description',
      notes: 'Notes',
      contact: 'Contact',
      price: 12.5,
      currency: 'USD',
      licenseType: 'personal',
      folders: ['Main'],
      mascotFiles: [],
      fixedAssetFiles: [FIXED_ASSET],
      etsyTags: ['tag'],
      templateId: 'tmpl_abc',
      complete: false,
      createdAt: '2025-01-01T00:00:00.000Z',
    })
  })
})
