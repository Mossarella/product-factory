import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }
let currentSession: typeof MOCK_SESSION | null = MOCK_SESSION

mock.module('@/auth', () => ({ auth: async () => currentSession }))
mock.module('@/lib/api-files', () => ({
  ROOT: '/tmp/test-root',
  PRODUCTS_DIR: '/tmp/test-products',
  ASSETS_DIR: '/tmp/test-assets',
  AVATARS_DIR: '/tmp/test-avatars',
  MIME: { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.zip': 'application/zip' },
  resolveWithinRoot: (...segments: string[]) => `/tmp/test-root/${segments.join('/')}`,
  resolveWithin: (directory: string, ...segments: string[]) => `${directory}/${segments.join('/')}`,
  productPath: (name: string, ...segments: string[]) => `/tmp/test-products/${name}/${segments.join('/')}`,
  userProductPath: (userId: string, name: string, ...segments: string[]) => `/tmp/test-products/${userId}/${name}/${segments.join('/')}`,
  assetPath: (name: string, ...segments: string[]) => `/tmp/test-assets/${name}/${segments.join('/')}`,
  avatarPath: (userId: string) => `/tmp/test-avatars/${userId}`,
  decodeSegment: (segment: string) => decodeURIComponent(segment),
  sanitizeName: (name: string) => name.trim().replace(/[^\w\- ]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  clearDirectory: () => {},
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf) => Buffer.from(buf)),
}))

const mockExistsSync = mock(() => true)
const mockReadFileSync = mock(() => Buffer.from('fake-zip'))
const mockMkdirSync = mock(() => {})
const mockWriteFileSync = mock(() => {})
const mockStatSync = mock(() => ({ isFile: () => true }))
mock.module('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    statSync: mockStatSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  statSync: mockStatSync,
}))

mock.module('@/config', () => ({
  CONFIG: {
    shopName: 'Test Shop',
    contact: 'test@example.com',
    description: 'Test description',
    readmeFooter: 'Test footer',
    etsyTagDefaults: [],
    extraFixedAssets: [],
  },
}))

const defaultManifest = () => ({
  version: 1,
  productName: 'Test',
  builtAt: '2025-01-01T00:00:00.000Z',
  files: [],
  fixedAssets: [],
  template: null,
  validation: null,
  warnings: [],
})
const mockBuildZipBuffer = mock(() => Promise.resolve({ buffer: Buffer.from('fake-zip'), manifest: defaultManifest() }))
mock.module('@/lib/zip-server', () => ({ buildZipBuffer: mockBuildZipBuffer }))

const mockBuildReadmeText = mock(() => 'README')
mock.module('@/lib/templates-server', () => ({ buildReadmeText: mockBuildReadmeText }))

const mockFindUnique = mock(() => Promise.resolve(null))
const mockProductUpdate = mock(() => Promise.resolve({ id: 'product-1' }))
const mockProductBuildCreate = mock(() => Promise.resolve({ id: 'build-1' }))
const mockTransaction = mock((operations: Promise<unknown>[]) => Promise.all(operations))
mock.module('@/lib/db', () => ({
  prisma: {
    product: { findUnique: mockFindUnique, update: mockProductUpdate },
    productBuild: { create: mockProductBuildCreate },
    $transaction: mockTransaction,
  },
}))

const { POST, GET: GET_BUILD } = await import('@/app/api/products/[name]/build/route')
const { GET: GET_LATEST } = await import('@/app/api/products/[name]/build/latest/route')

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
    template: null,
    complete: false,
    buildVersion: 0,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    files: [],
    fixedAssetFiles: [],
    builds: [],
    ...overrides,
  }
}

const context = { params: Promise.resolve({ name: 'TestProduct' }) }
const buildRequest = (body?: string, headers?: HeadersInit) => new NextRequest('http://localhost/api/products/TestProduct/build', { method: 'POST', body, headers })
const latestRequest = () => new NextRequest('http://localhost/api/products/TestProduct/build/latest')
const listRequest = () => new NextRequest('http://localhost/api/products/TestProduct/build')

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockExistsSync.mockReset()
  mockReadFileSync.mockReset()
  mockMkdirSync.mockReset()
  mockWriteFileSync.mockReset()
  mockStatSync.mockReset()
  mockBuildZipBuffer.mockReset()
  mockBuildReadmeText.mockReset()
  mockFindUnique.mockReset()
  mockProductUpdate.mockReset()
  mockProductBuildCreate.mockReset()
  mockTransaction.mockReset()
  mockExistsSync.mockReturnValue(true)
  mockReadFileSync.mockReturnValue(Buffer.from('fake-zip'))
  mockMkdirSync.mockImplementation(() => {})
  mockWriteFileSync.mockImplementation(() => {})
  mockStatSync.mockReturnValue({ isFile: () => true })
  mockBuildZipBuffer.mockReturnValue(Promise.resolve({ buffer: Buffer.from('fake-zip'), manifest: defaultManifest() }))
  mockBuildReadmeText.mockReturnValue('README')
  mockFindUnique.mockReturnValue(Promise.resolve(product()))
  mockProductUpdate.mockReturnValue(Promise.resolve({ id: 'product-1' }))
  mockProductBuildCreate.mockReturnValue(Promise.resolve({ id: 'build-1' }))
  mockTransaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('POST /api/products/[name]/build', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null
    expect((await POST(buildRequest(), context)).status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    expect((await POST(buildRequest(), context)).status).toBe(404)
  })

  it('creates the next build version in a transaction', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({ buildVersion: 2 })))

    const response = await POST(buildRequest(), context)

    expect(response.status).toBe(200)
    expect((await response.json()).version).toBe(3)
    expect(mockProductUpdate).toHaveBeenCalledWith({ where: { id: 'product-1' }, data: { buildVersion: 3 } })
  })

  it('reports required validation failures for templated products', async () => {
    const validation = [{ ruleId: 'description', label: 'Description', required: true, status: 'missing' as const }]
    mockFindUnique.mockReturnValue(Promise.resolve(product({
      templateId: 'template-1',
      template: { id: 'template-1', name: 'Template', rules: [{ id: 'description', type: 'field_present', label: 'Description', required: true, field: 'description' }] },
    })))
    mockBuildZipBuffer.mockReturnValue(Promise.resolve({ buffer: Buffer.from('fake-zip'), manifest: { ...defaultManifest(), validation } }))

    const response = await POST(buildRequest(), context)

    expect((await response.json()).hasRequiredFailures).toBe(true)
  })

  it('skips validation for products without a template', async () => {
    const response = await POST(buildRequest(), context)
    const body = await response.json()

    expect(body.hasRequiredFailures).toBe(false)
    expect(body.manifest.validation).toBeNull()
    expect(mockBuildZipBuffer.mock.calls[0][0].validation).toBeNull()
  })

  it('stores the caller-provided notes as the changelog verbatim when notes are non-empty', async () => {
    const response = await POST(buildRequest(JSON.stringify({ notes: '  Fixed a typo  ' }), { 'Content-Type': 'application/json' }), context)

    expect((await response.json()).changelog).toBe('Fixed a typo')
    expect(mockProductBuildCreate.mock.calls[0][0].data.changelog).toBe('Fixed a typo')
  })

  it('auto-generates the changelog from the manifest diff when notes are blank', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({ builds: [] })))

    const response = await POST(buildRequest(), context)

    expect((await response.json()).changelog).toBe('Initial build')
  })
})

describe('GET /api/products/[name]/build (list)', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null
    expect((await GET_BUILD(listRequest(), context)).status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    expect((await GET_BUILD(listRequest(), context)).status).toBe(404)
  })

  it('returns builds newest-first with changelog and revertedFrom fields', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({
      builds: [
        { version: 2, fileSize: 100, changelog: 'v2 notes', revertedFrom: null, createdAt: new Date('2025-02-01T00:00:00.000Z') },
        { version: 1, fileSize: 90, changelog: 'Initial build', revertedFrom: null, createdAt: new Date('2025-01-01T00:00:00.000Z') },
      ],
    })))

    const response = await GET_BUILD(listRequest(), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { version: 2, fileSize: 100, changelog: 'v2 notes', revertedFrom: null, createdAt: '2025-02-01T00:00:00.000Z' },
      { version: 1, fileSize: 90, changelog: 'Initial build', revertedFrom: null, createdAt: '2025-01-01T00:00:00.000Z' },
    ])
  })
})

describe('GET /api/products/[name]/build/latest', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null
    expect((await GET_LATEST(latestRequest(), context)).status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    expect((await GET_LATEST(latestRequest(), context)).status).toBe(404)
  })

  it('returns 404 when the product has no builds', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({ builds: [] })))
    expect((await GET_LATEST(latestRequest(), context)).status).toBe(404)
  })

  it('downloads the latest build zip', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(product({ builds: [{ filename: 'v3.zip', version: 3 }] })))

    const response = await GET_LATEST(latestRequest(), context)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(response.headers.get('Content-Disposition')).toContain('Test Product')
  })
})
