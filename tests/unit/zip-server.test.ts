import { beforeEach, describe, expect, it, mock } from 'bun:test'
import JSZip from 'jszip'

const existsSync = mock<(diskPath: string) => boolean>(() => true)
const readFileSync = mock<(diskPath: string) => Buffer>(() => Buffer.from('fake-file-content'))
const mockGetObject = mock<(key: string) => Promise<{ body: Buffer; contentType?: string; metadata?: Record<string, string> } | null>>(
  () => Promise.resolve({ body: Buffer.from('fake-file-content') }),
)
const mockPutObject = mock(() => Promise.resolve())
const mockDeleteObject = mock(() => Promise.resolve())
const mockObjectExists = mock(() => Promise.resolve(false))
const mockCopyObjectsByPrefix = mock(() => Promise.resolve())
let shopDefaultFilename: string | undefined

// Mock filesystem and api-files before importing zip-server so these tests do no I/O.
mock.module('fs', () => ({
  default: { existsSync, readFileSync },
  existsSync,
  readFileSync,
}))

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
  sanitizeName: (name: string) => name.trim().replace(/[^\w\- ]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  clearDirectory: () => {},
  firstFile: () => shopDefaultFilename,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

mock.module('@/lib/object-storage', () => ({
  putObject: mockPutObject,
  getObject: mockGetObject,
  deleteObject: mockDeleteObject,
  objectExists: mockObjectExists,
  copyObjectsByPrefix: mockCopyObjectsByPrefix,
  productKey: (productId: string, ...segments: string[]) => ['products', productId, ...segments].join('/'),
}))

const { buildZipBuffer, resolveFilename } = await import('@/lib/zip-server')

function buildOptions(overrides: Partial<Parameters<typeof buildZipBuffer>[0]> = {}) {
  return {
    productId: 'product-1',
    displayProductName: 'MyProduct',
    mascotFiles: [],
    fixedAssetFiles: [],
    readmeText: 'Read me',
    version: 1,
    template: null,
    validation: null,
    ...overrides,
  }
}

beforeEach(() => {
  shopDefaultFilename = undefined
  existsSync.mockReset()
  existsSync.mockReturnValue(true)
  readFileSync.mockReset()
  readFileSync.mockReturnValue(Buffer.from('fake-file-content'))
  mockGetObject.mockReset()
  mockGetObject.mockReturnValue(Promise.resolve({ body: Buffer.from('fake-file-content') }))
})

describe('resolveFilename()', () => {
  it('uses the variant in the filename when present', () => {
    expect(resolveFilename('MyProduct', { origName: 'photo.png', folder: 'Expressions', variant: 'Happy' }, 0, 1))
      .toBe('MyProduct_Expressions_Happy.png')
  })

  it('uses the folder name for a single non-variant file', () => {
    expect(resolveFilename('MyProduct', { origName: 'photo.png', folder: 'Main', variant: '' }, 0, 1))
      .toBe('MyProduct_Main.png')
  })

  it('uses a one-based index for multiple non-variant files', () => {
    expect(resolveFilename('MyProduct', { origName: 'photo.png', folder: 'Main', variant: '' }, 2, 5))
      .toBe('MyProduct_Main_3.png')
  })

  it('preserves the current trailing-dot behavior for filenames without an extension', () => {
    expect(resolveFilename('MyProduct', { origName: 'photo', folder: 'Main', variant: '' }, 0, 1))
      .toBe('MyProduct_Main.')
  })
})

describe('buildZipBuffer()', () => {
  it('adds a mascot file to the manifest with its resolved ZIP filename', async () => {
    const { manifest } = await buildZipBuffer(buildOptions({
      mascotFiles: [{ filename: 'stored.png', origName: 'photo.png', folder: 'Expressions', variant: 'Happy' }],
    }))

    expect(manifest.files).toEqual([
      { folder: 'Expressions', zipFilename: 'MyProduct_Expressions_Happy.png', origName: 'photo.png' },
    ])
  })

  it('skips a mascot file that is missing from object storage and records a warning', async () => {
    mockGetObject.mockImplementation((key: string) => Promise.resolve(
      key.includes('missing.png') ? null : { body: Buffer.from('fake-file-content') },
    ))

    const { manifest } = await buildZipBuffer(buildOptions({
      mascotFiles: [{ filename: 'missing.png', origName: 'missing-original.png', folder: 'Main', variant: '' }],
    }))

    expect(manifest.files).toEqual([])
    expect(manifest.warnings).toContain('Skipped missing file: missing-original.png')
  })

  it('records a fixed asset override in the manifest', async () => {
    const { manifest } = await buildZipBuffer(buildOptions({
      fixedAssetFiles: [{ assetKey: 'thankyou', filename: 'custom.png', origName: 'custom-thanks.png' }],
    }))

    expect(manifest.fixedAssets).toContainEqual({ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'override' })
  })

  it('uses the shop default thank-you asset when there is no override', async () => {
    shopDefaultFilename = 'shop-thanks.png'

    const { manifest } = await buildZipBuffer(buildOptions())

    expect(manifest.fixedAssets).toContainEqual({ assetKey: 'thankyou', zipFilename: 'THANKYOU.png', source: 'shop-default' })
  })

  it('omits builtin assets when neither an override nor a shop default exists', async () => {
    const { manifest } = await buildZipBuffer(buildOptions())

    expect(manifest.fixedAssets).toEqual([])
    expect(manifest.warnings).toEqual([])
  })

  it('writes manifest.json into the returned ZIP buffer', async () => {
    const result = await buildZipBuffer(buildOptions({
      mascotFiles: [{ filename: 'stored.png', origName: 'photo.png', folder: 'Main', variant: '' }],
    }))
    const zip = await JSZip.loadAsync(result.buffer)
    const manifestFile = zip.file('manifest.json')

    expect(manifestFile).toBeDefined()
    expect(JSON.parse(await manifestFile!.async('text'))).toEqual(result.manifest)
  })
})
