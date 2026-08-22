import { describe, expect, it, mock } from 'bun:test'

const mockObjectExists = mock(() => Promise.resolve(false))
const mockPutObject = mock(() => Promise.resolve())
const mockGetObject = mock(() => Promise.resolve(null))
const mockDeleteObject = mock(() => Promise.resolve())
const mockCopyObjectsByPrefix = mock(() => Promise.resolve())
mock.module('@/lib/object-storage', () => ({
  putObject: mockPutObject,
  getObject: mockGetObject,
  deleteObject: mockDeleteObject,
  copyObjectsByPrefix: mockCopyObjectsByPrefix,
  objectExists: mockObjectExists,
  productKey: (productId: string, ...segments: string[]) => ['products', productId, ...segments].join('/'),
}))

mock.module('@/lib/api-files', () => ({
  ROOT: '/tmp/test-root',
  ASSETS_DIR: '/tmp/test-assets',
  MIME: { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' },
  resolveWithinRoot: (...segments: string[]) => `/tmp/test-root/${segments.join('/')}`,
  resolveWithin: (directory: string, ...segments: string[]) => `${directory}/${segments.join('/')}`,
  assetPath: (name: string, ...segments: string[]) => `/tmp/test-assets/${name}/${segments.join('/')}`,
  decodeSegment: (segment: string) => decodeURIComponent(segment),
  sanitizeName: (name: string) => name.trim().replace(/[^\w\- ]/g, ''),
  sanitizeFilename: (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, ''),
  contentTypeFor: (filename: string) => filename.endsWith('.png') ? 'image/png' : 'application/octet-stream',
  firstFile: () => undefined,
  readBodyBuffer: (request: Request) => request.arrayBuffer().then((buf: ArrayBuffer) => Buffer.from(buf)),
}))

const { computeStats } = await import('@/lib/dashboard-stats')

function makeProduct(overrides = {}) {
  return {
    id: 'product-1',
    name: 'TestProduct',
    complete: false,
    description: 'A product',
    etsyTitle: 'Test Etsy Title',
    etsyTags: ['tag1', 'tag2'],
    createdAt: new Date(),
    files: [{ id: '1', origName: 'image.png' }],
    ...overrides,
  }
}

describe('computeStats()', () => {
  it('counts total correctly', async () => {
    const stats = await computeStats([makeProduct(), makeProduct({ name: 'P2' })])
    expect(stats.total).toBe(2)
  })

  it('counts readyToPublish (complete: true)', async () => {
    const stats = await computeStats([
      makeProduct({ complete: true }),
      makeProduct({ complete: false }),
    ])
    expect(stats.readyToPublish).toBe(1)
  })

  it('counts needsReview (not complete but has files or title)', async () => {
    const stats = await computeStats([
      makeProduct({ complete: false, files: [{ id: '1', origName: 'x.png' }], etsyTitle: '' }),
      makeProduct({ complete: false, files: [], etsyTitle: 'Has Title' }),
      makeProduct({ complete: false, files: [], etsyTitle: '' }),
    ])
    expect(stats.needsReview).toBe(2)
  })

  it('needReadme counts products with empty description', async () => {
    const stats = await computeStats([
      makeProduct({ description: '' }),
      makeProduct({ description: '   ' }),
      makeProduct({ description: 'Has desc' }),
    ])
    expect(stats.needReadme).toBe(2)
  })

  it('noGifPreview counts products without any .gif file', async () => {
    const stats = await computeStats([
      makeProduct({ files: [{ id: '1', origName: 'anim.gif' }] }),
      makeProduct({ name: 'P2', files: [{ id: '2', origName: 'image.png' }] }),
    ])
    expect(stats.noGifPreview).toBe(1)
  })

  it('sharedTags counts products with duplicate tag sets', async () => {
    const stats = await computeStats([
      makeProduct({ name: 'P1', etsyTags: ['a', 'b'] }),
      makeProduct({ name: 'P2', etsyTags: ['b', 'a'] }),
      makeProduct({ name: 'P3', etsyTags: ['c'] }),
    ])
    expect(stats.sharedTags).toBe(2)
  })

  it('tolerates legacy products with null Etsy tags and files', async () => {
    const stats = await computeStats([makeProduct({ etsyTags: null, files: null, description: null })])
    expect(stats.total).toBe(1)
    expect(stats.sharedTags).toBe(0)
    expect(stats.noGifPreview).toBe(1)
    expect(stats.needReadme).toBe(1)
  })

  it('returns zero stats for empty product list', async () => {
    const stats = await computeStats([])
    expect(stats.total).toBe(0)
    expect(stats.readyToPublish).toBe(0)
    expect(stats.needsReview).toBe(0)
  })
})
