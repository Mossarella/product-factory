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

const defaultManifest = () => ({
  version: 2,
  productName: 'Test',
  builtAt: '2025-01-02T00:00:00.000Z',
  files: [],
  fixedAssets: [],
  template: null,
  validation: null,
  warnings: [],
  readmeHash: 'hash',
})
const mockBuildZipBuffer = mock(() => Promise.resolve({ buffer: Buffer.from('fake-zip'), manifest: defaultManifest() }))
const mockRebuildManifestForRevert = mock(() => Promise.resolve({ buffer: Buffer.from('fake-zip'), manifest: defaultManifest() }))
mock.module('@/lib/zip-server', () => ({ buildZipBuffer: mockBuildZipBuffer, rebuildManifestForRevert: mockRebuildManifestForRevert }))

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

const { GET } = await import('@/app/api/products/[name]/build/[version]/route')
const { POST } = await import('@/app/api/products/[name]/build/[version]/revert/route')

const context = { params: Promise.resolve({ name: 'TestProduct', version: '1' }) }
const buildRequest = () => new NextRequest('http://localhost/api/products/TestProduct/build/1')
const revertRequest = () => new NextRequest('http://localhost/api/products/TestProduct/build/1/revert', { method: 'POST' })

beforeEach(() => {
  currentSession = MOCK_SESSION
  mockExistsSync.mockReset()
  mockReadFileSync.mockReset()
  mockMkdirSync.mockReset()
  mockWriteFileSync.mockReset()
  mockStatSync.mockReset()
  mockBuildZipBuffer.mockReset()
  mockRebuildManifestForRevert.mockReset()
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
  mockRebuildManifestForRevert.mockReturnValue(Promise.resolve({ buffer: Buffer.from('fake-zip'), manifest: defaultManifest() }))
  mockFindUnique.mockReturnValue(Promise.resolve(null))
  mockProductUpdate.mockReturnValue(Promise.resolve({ id: 'product-1' }))
  mockProductBuildCreate.mockReturnValue(Promise.resolve({ id: 'build-1' }))
  mockTransaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations))
})

afterEach(() => {
  currentSession = MOCK_SESSION
})

describe('GET /api/products/[name]/build/[version]', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null
    expect((await GET(buildRequest(), context)).status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    expect((await GET(buildRequest(), context)).status).toBe(404)
  })

  it('returns 404 when no build matches that version', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ builds: [] }))
    expect((await GET(buildRequest(), context)).status).toBe(404)
  })

  it('downloads the matching build zip', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ name: 'TestProduct', productName: 'Test Product', builds: [{ filename: 'v1.zip', version: 1 }] }))

    const response = await GET(buildRequest(), context)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(response.headers.get('Content-Disposition')).toContain('v1')
  })
})

describe('POST /api/products/[name]/build/[version]/revert', () => {
  it('returns 401 when unauthenticated', async () => {
    currentSession = null
    expect((await POST(revertRequest(), context)).status).toBe(401)
  })

  it('returns 404 when the product does not exist', async () => {
    expect((await POST(revertRequest(), context)).status).toBe(404)
  })

  it('returns 404 when no build matches the target version', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({ builds: [] }))
    expect((await POST(revertRequest(), context)).status).toBe(404)
  })

  it('reverts to the requested build version', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve({
      id: 'product-1',
      name: 'TestProduct',
      productName: 'Test Product',
      buildVersion: 3,
      builds: [{ filename: 'v1.zip', version: 1 }],
    }))

    const response = await POST(revertRequest(), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ version: 4, revertedFrom: 1, changelog: 'Reverted to v1' })
    expect(mockProductUpdate).toHaveBeenCalledWith({ where: { id: 'product-1' }, data: { buildVersion: 4 } })
    expect(mockProductBuildCreate.mock.calls[0][0].data).toMatchObject({ revertedFrom: 1, changelog: 'Reverted to v1' })
  })
})
