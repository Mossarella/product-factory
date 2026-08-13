import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerAToken = process.env.SUPABASE_ISOLATION_ACCESS_TOKEN_A
const ownerBToken = process.env.SUPABASE_ISOLATION_ACCESS_TOKEN_B
const configured = Boolean(url && anonKey && serviceRoleKey && ownerAToken && ownerBToken)

type TestClient = SupabaseClient

function authenticatedClient(accessToken: string) {
  return createClient(url!, anonKey!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } })
}

const liveDescribe = configured ? describe : describe.skip

liveDescribe('Supabase owner and Storage isolation', () => {
  let ownerA: TestClient
  let ownerB: TestClient
  let admin: TestClient
  let ownerAId = ''
  let ownerBId = ''
  let productId = ''
  let buildId = ''
  let releaseId = ''
  const suffix = `isolation-${Date.now()}`
  const productName = `Isolation Fixture ${suffix}`
  const filePath = `isolation/${suffix}/source.txt`
  const zipPath = `isolation/${suffix}/release.zip`

  beforeAll(async () => {
    ownerA = authenticatedClient(ownerAToken!)
    ownerB = authenticatedClient(ownerBToken!)
    admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false } })

    const [{ data: userA }, { data: userB }] = await Promise.all([ownerA.auth.getUser(), ownerB.auth.getUser()])
    if (!userA.user || !userB.user || userA.user.id === userB.user.id) throw new Error('Isolation test requires two distinct authenticated owners')
    ownerAId = userA.user.id
    ownerBId = userB.user.id

    const { data: product, error: productError } = await ownerA.from('products').insert({ owner_id: ownerAId, name: productName, product_name: productName }).select('id').single()
    if (productError || !product) throw productError ?? new Error('Could not create isolation product')
    productId = product.id

    const { data: build, error: buildError } = await ownerA.from('product_builds').insert({ owner_id: ownerAId, product_id: productId, version: 1, filename: 'release.zip', file_size: 4, storage_path: zipPath }).select('id').single()
    if (buildError || !build) throw buildError ?? new Error('Could not create isolation build')
    buildId = build.id

    const { data: release, error: releaseError } = await ownerA.from('product_releases').insert({ owner_id: ownerAId, product_id: productId, build_id: buildId, version: 1, bundle_storage_path: zipPath, bundle_filename: 'Release-v1.zip', bundle_size: 4, bundle_sha256: 'a'.repeat(64) }).select('id').single()
    if (releaseError || !release) throw releaseError ?? new Error('Could not create isolation release')
    releaseId = release.id
  })

  afterAll(async () => {
    if (!admin || !productId) return
    await admin.storage.from('product-files').remove([filePath])
    await admin.storage.from('product-builds').remove([zipPath])
    await admin.from('product_releases').delete().eq('id', releaseId)
    await admin.from('product_builds').delete().eq('id', buildId)
    await admin.from('products').delete().eq('id', productId)
  })

  it('allows owner A to read its rows and private objects', async () => {
    const [{ data: product }, { data: build }, { data: release }] = await Promise.all([
      ownerA.from('products').select('id,owner_id').eq('id', productId).single(),
      ownerA.from('product_builds').select('id,owner_id').eq('id', buildId).single(),
      ownerA.from('product_releases').select('id,owner_id').eq('id', releaseId).single(),
    ])
    expect(product?.owner_id).toBe(ownerAId)
    expect(build?.owner_id).toBe(ownerAId)
    expect(release?.owner_id).toBe(ownerAId)

    const sourceUpload = await ownerA.storage.from('product-files').upload(filePath, new Blob(['source']), { upsert: true })
    expect(sourceUpload.error).toBeNull()
    const zipUpload = await ownerA.storage.from('product-builds').upload(zipPath, new Blob(['zip!']), { upsert: true })
    expect(zipUpload.error).toBeNull()
    expect((await ownerA.storage.from('product-files').download(filePath)).error).toBeNull()
    expect((await ownerA.storage.from('product-builds').download(zipPath)).error).toBeNull()
  })

  it('blocks owner B from reading or mutating owner A rows', async () => {
    const productRead = await ownerB.from('products').select('id').eq('id', productId)
    expect(productRead.error).toBeNull()
    expect(productRead.data).toEqual([])

    const productUpdate = await ownerB.from('products').update({ notes: 'cross-owner write' }).eq('id', productId).select('id')
    expect(productUpdate.error).toBeNull()
    expect(productUpdate.data).toEqual([])

    const buildRead = await ownerB.from('product_builds').select('id').eq('id', buildId)
    const eventRead = await ownerB.from('product_events').select('id').eq('owner_id', ownerAId)
    const releaseRead = await ownerB.from('product_releases').select('id').eq('id', releaseId)
    expect(buildRead.data).toEqual([])
    expect(eventRead.data).toEqual([])
    expect(releaseRead.data).toEqual([])

    const productDelete = await ownerB.from('products').delete().eq('id', productId).select('id')
    expect(productDelete.error).toBeNull()
    expect(productDelete.data).toEqual([])
  })

  it('blocks owner B from private source and release ZIP objects', async () => {
    const sourceRead = await ownerB.storage.from('product-files').download(filePath)
    const zipRead = await ownerB.storage.from('product-builds').download(zipPath)
    expect(sourceRead.data).toBeNull()
    expect(zipRead.data).toBeNull()
    expect(sourceRead.error).toBeTruthy()
    expect(zipRead.error).toBeTruthy()

    const sourceUpdate = await ownerB.storage.from('product-files').upload(filePath, new Blob(['tampered']), { upsert: true })
    const zipDelete = await ownerB.storage.from('product-builds').remove([zipPath])
    expect(sourceUpdate.error).toBeTruthy()
    expect(zipDelete.error).toBeTruthy()
  })
})
