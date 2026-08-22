import { beforeEach, describe, expect, it, mock } from 'bun:test'
import JSZip from 'jszip'

const OWNER_ID = 'owner-a'
const OTHER_OWNER_ID = 'owner-b'
const PRODUCT_ID = 'product-a'
const BUILD_ID = 'build-a'
const PRODUCT_NAME = 'sample-product'
const BUILD_VERSION = 3
const SOURCE_PATH = `${OWNER_ID}/${PRODUCT_ID}/builds/${BUILD_VERSION}/sample-product-v${BUILD_VERSION}.zip`
const RELEASE_PATH = `${OWNER_ID}/${PRODUCT_ID}/releases/v${BUILD_VERSION}/Sample Product-Release-v${BUILD_VERSION}.zip`

const product = {
  owner_id: OWNER_ID,
  id: PRODUCT_ID,
  name: PRODUCT_NAME,
  product_name: 'Sample Product',
  build_version: BUILD_VERSION,
}

const build = {
  owner_id: OWNER_ID,
  product_id: PRODUCT_ID,
  id: BUILD_ID,
  version: BUILD_VERSION,
  filename: 'sample-product-v3.zip',
  storage_path: SOURCE_PATH,
}

const release = {
  owner_id: OWNER_ID,
  id: 'release-a',
  product_id: PRODUCT_ID,
  build_id: BUILD_ID,
  version: BUILD_VERSION,
  bundle_filename: 'Sample-Product-v3.zip',
  bundle_size: 32,
  bundle_sha256: 'a'.repeat(64),
  bundle_storage_path: RELEASE_PATH,
  listing_snapshot: { title: 'Sample Product' },
  release_summary: { version: BUILD_VERSION },
  created_at: '2026-08-14T00:00:00.000Z',
}

type QueryState = {
  filters: Array<{ column: string; value: unknown }>
  table: string
  payload?: Record<string, unknown> | Array<Record<string, unknown>>
}

type TestState = {
  user: { id: string } | null
  insertError: { message: string; code?: string } | null
  storageUploadError: { message: string } | null
  storageDownloadError: { message: string } | null
  currentBuildVersion: number
  sourceObject: Blob
  storageObjects: Record<string, Blob>
  removedPaths: string[][]
  uploadedPaths: string[]
  releases: typeof release[]
}

let state: TestState

const result = (data: unknown, error: unknown = null) => Promise.resolve({ data, error })

function matchingRows(table: string, filters: QueryState['filters']) {
  const rows = table === 'products' ? [{ ...product, build_version: state.currentBuildVersion }] : table === 'product_builds' ? [build] : state.releases
  return rows.filter((row) => filters.every(({ column, value }) => {
    return (row as Record<string, unknown>)[column] === value
  }))
}

function createQuery(table: string) {
  const queryState: QueryState = { table, filters: [] }
  const builder: Record<string, unknown> = {
    select: mock(() => builder),
    eq: mock((column: string, value: unknown) => {
      queryState.filters.push({ column, value })
      return builder
    }),
    order: mock(() => {
      const rows = matchingRows(table, queryState.filters)
      return result(rows)
    }),
    maybeSingle: mock(() => {
      const rows = matchingRows(table, queryState.filters)
      return result(rows[0] ?? null)
    }),
    insert: mock((payload: QueryState['payload']) => {
      queryState.payload = payload
      return builder
    }),
    single: mock(() => {
      if (state.insertError) return result(null, state.insertError)
      const row = { ...release, ...(queryState.payload as Record<string, unknown>) }
      state.releases.push(row)
      return result(row)
    }),
  }
  return builder
}

function createSupabaseMock() {
  return {
    auth: { getUser: mock(async () => ({ data: { user: state.user } })) },
    from: mock((table: string) => createQuery(table)),
    storage: {
      from: mock(() => ({
        download: mock(async (path: string) => {
          if (state.storageDownloadError) return { data: null, error: state.storageDownloadError }
          return { data: state.storageObjects[path] ?? null, error: state.storageObjects[path] ? null : { message: 'Not found' } }
        }),
        upload: mock(async (path: string) => {
          state.uploadedPaths.push(path)
          return { data: null, error: state.storageUploadError }
        }),
        remove: mock(async (paths: string[]) => {
          state.removedPaths.push(paths)
          return { data: null, error: null }
        }),
      })),
    },
  }
}

const supabaseMock = createSupabaseMock()

mock.module('@/lib/supabase/server', () => ({
  createClient: async () => supabaseMock,
}))
mock.module('@/lib/entitlements', () => ({
  EntitlementError: class EntitlementError extends Error {},
  getEntitlement: async () => ({ tier: 'creator', productLimit: 500, storageLimitBytes: 5 * 1024 * 1024 * 1024, maxFileBytes: 100 * 1024 * 1024, etsyEnabled: true, releaseRetention: 3, productCount: 1, storageUsedBytes: 0 }),
  assertStorageCapacity: () => undefined,
  entitlementErrorResponse: () => null,
}))

const { GET: getReleaseHistory, POST: finalizeRelease } = await import('@/app/api/products/[name]/release/route')
const { GET: downloadRelease } = await import('@/app/api/products/[name]/release/[version]/route')

const productParams = (name = PRODUCT_NAME) => ({ params: Promise.resolve({ name }) })
const releaseParams = (name = PRODUCT_NAME, version = String(BUILD_VERSION)) => ({ params: Promise.resolve({ name, version }) })

async function makeReleaseZip(options: { includeArtifacts?: boolean; invalidJson?: boolean } = {}) {
  const zip = new JSZip()
  if (options.includeArtifacts !== false) {
    const listing = { productName: product.product_name, title: 'Sample Product', description: 'A sample product.', tags: [], sku: 'SAMPLE-003', price: 4, currency: 'USD', licenseType: 'personal', commercialPrice: null }
    const summary = { productId: PRODUCT_ID, productName: product.product_name, version: BUILD_VERSION, builtAt: '2026-08-14T00:00:00.000Z', validation: null, warnings: [], fileCount: 0, fixedAssetCount: 0, template: null }
    zip.file('etsy-listing.json', options.invalidJson ? '{' : JSON.stringify(listing))
    zip.file('release-summary.json', JSON.stringify(summary))
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

beforeEach(async () => {
  const sourceObject = new Blob([await makeReleaseZip()])
  state = {
    user: { id: OWNER_ID },
    insertError: null,
    storageUploadError: null,
    storageDownloadError: null,
    currentBuildVersion: BUILD_VERSION,
    sourceObject,
    storageObjects: { [SOURCE_PATH]: sourceObject, [RELEASE_PATH]: new Blob(['release-zip']) },
    removedPaths: [],
    uploadedPaths: [],
    releases: [],
  }
})

describe('release routes', () => {
  it('requires authentication for release history, finalization, and downloads', async () => {
    state.user = null

    expect((await getReleaseHistory(new Request('http://localhost'), productParams())).status).toBe(401)
    expect((await finalizeRelease(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }), productParams())).status).toBe(401)
    expect((await downloadRelease(new Request('http://localhost'), releaseParams())).status).toBe(401)
  })

  it('rejects finalization for a stale build version', async () => {
    state.currentBuildVersion = BUILD_VERSION + 1

    const response = await finalizeRelease(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }),
      productParams(),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: `Build v${BUILD_VERSION} is stale; the current package is v${BUILD_VERSION + 1}`,
      code: 'STALE_BUILD',
      latestVersion: BUILD_VERSION + 1,
    })
    expect(state.uploadedPaths).toEqual([])
  })

  it('rejects a build ZIP that is missing embedded release artifacts', async () => {
    state.sourceObject = new Blob([await makeReleaseZip({ includeArtifacts: false })])
    state.storageObjects[SOURCE_PATH] = state.sourceObject

    const response = await finalizeRelease(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }),
      productParams(),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: 'Build does not contain release artifacts',
      code: 'RELEASE_ARTIFACTS_MISSING',
    })
    expect(state.uploadedPaths).toEqual([])
  })

  it('rejects a build ZIP with invalid embedded release JSON', async () => {
    state.sourceObject = new Blob([await makeReleaseZip({ invalidJson: true })])
    state.storageObjects[SOURCE_PATH] = state.sourceObject

    const response = await finalizeRelease(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }),
      productParams(),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: 'Build contains invalid release artifacts',
      code: 'RELEASE_ARTIFACTS_INVALID',
    })
    expect(state.uploadedPaths).toEqual([])
  })

  it('returns the existing release without rebuilding or uploading on duplicate finalization', async () => {
    state.releases = [release]

    const response = await finalizeRelease(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }),
      productParams(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ release, created: false })
    expect(state.uploadedPaths).toEqual([])
    expect(state.removedPaths).toEqual([])
  })

  it('returns the Storage upload error without persisting or cleaning up a bundle', async () => {
    state.storageUploadError = { message: 'Storage temporarily unavailable' }

    const response = await finalizeRelease(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }),
      productParams(),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Storage temporarily unavailable' })
    expect(state.uploadedPaths).toEqual([RELEASE_PATH])
    expect(state.removedPaths).toEqual([])
    expect(state.releases).toEqual([])
  })

  it('does not expose another owner product through release history or finalization', async () => {
    state.user = { id: OTHER_OWNER_ID }

    const history = await getReleaseHistory(new Request('http://localhost'), productParams())
    const finalize = await finalizeRelease(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }), productParams())

    expect(history.status).toBe(404)
    expect(await history.json()).toEqual({ error: 'Product not found' })
    expect(finalize.status).toBe(404)
    expect(await finalize.json()).toEqual({ error: 'Product not found' })
  })

  it('does not expose another owner release through the download route', async () => {
    state.user = { id: OTHER_OWNER_ID }

    const response = await downloadRelease(new Request('http://localhost'), releaseParams())

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Product not found' })
  })

  it('lists owned release history and returns the immutable release download', async () => {
    state.releases = [release]

    const history = await getReleaseHistory(new Request('http://localhost'), productParams())
    expect(history.status).toBe(200)
    expect(await history.json()).toEqual([release])

    const response = await downloadRelease(new Request('http://localhost'), releaseParams())
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(response.headers.get('Content-Disposition')).toContain('Sample-Product-v3.zip')
    expect(response.headers.get('X-Release-SHA256')).toBe(release.bundle_sha256)
  })

  it('removes the uploaded release bundle when release persistence fails', async () => {
    state.insertError = { message: 'database unavailable' }

    const response = await finalizeRelease(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ version: BUILD_VERSION }) }),
      productParams(),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'database unavailable' })
    expect(state.uploadedPaths).toEqual([RELEASE_PATH])
    expect(state.removedPaths).toEqual([[RELEASE_PATH]])
  })
})
