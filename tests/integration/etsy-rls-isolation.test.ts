import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerAToken = process.env.SUPABASE_ISOLATION_ACCESS_TOKEN_A
const ownerBToken = process.env.SUPABASE_ISOLATION_ACCESS_TOKEN_B
const configured = Boolean(url && anonKey && serviceRoleKey && ownerAToken && ownerBToken)

type TestClient = SupabaseClient

function authenticatedClient(accessToken: string) {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

const liveDescribe = configured ? describe : describe.skip

liveDescribe('Etsy Supabase RLS isolation', () => {
  let ownerA: TestClient
  let ownerB: TestClient
  let admin: TestClient
  let ownerAId = ''
  let ownerBId = ''
  let connectionId = ''
  let inventoryItemId = ''
  let productId = ''
  let buildId = ''
  let releaseId = ''
  let publicationId = ''
  const suffix = `etsy-rls-${Date.now()}`
  const shopId = Number(`9${String(Date.now()).slice(-9)}`)
  const stateHash = `state-hash-${suffix}`

  beforeAll(async () => {
    ownerA = authenticatedClient(ownerAToken!)
    ownerB = authenticatedClient(ownerBToken!)
    admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false } })

    const [{ data: userA }, { data: userB }] = await Promise.all([
      ownerA.auth.getUser(),
      ownerB.auth.getUser(),
    ])
    if (!userA.user || !userB.user || userA.user.id === userB.user.id) {
      throw new Error('Etsy RLS test requires two distinct authenticated owners')
    }
    ownerAId = userA.user.id
    ownerBId = userB.user.id

    const { data: connection, error: connectionError } = await admin
      .from('etsy_connections')
      .insert({
        owner_id: ownerAId,
        etsy_user_id: shopId + 100,
        shop_id: shopId,
        shop_name: `RLS Test Shop ${suffix}`,
        scopes: ['listings_r', 'listings_w', 'shops_r'],
        status: 'connected',
      })
      .select('id')
      .single()
    if (connectionError || !connection) throw connectionError ?? new Error('Could not create Etsy connection fixture')
    connectionId = connection.id

    const { error: secretError } = await admin.from('etsy_connection_secrets').insert({
      connection_id: connectionId,
      access_token_ciphertext: 'ciphertext-access-fixture',
      refresh_token_ciphertext: 'ciphertext-refresh-fixture',
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    if (secretError) throw secretError

    const { error: stateError } = await admin.from('etsy_oauth_states').insert({
      owner_id: ownerAId,
      state_hash: stateHash,
      code_verifier_ciphertext: 'ciphertext-verifier-fixture',
      redirect_uri: 'https://example.test/api/integrations/etsy/callback',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    })
    if (stateError) throw stateError

    const { data: inventoryItem, error: inventoryError } = await admin
      .from('etsy_inventory_items')
      .insert({
        owner_id: ownerAId,
        connection_id: connectionId,
        etsy_listing_id: shopId + 200,
        title: `RLS Inventory ${suffix}`,
        state: 'active',
        sku: `RLS-${suffix}`,
        price: 4.99,
        quantity: 1,
        currency: 'USD',
        listing_payload: { listing_id: shopId + 200 },
        inventory_payload: { products: [] },
      })
      .select('id')
      .single()
    if (inventoryError || !inventoryItem) throw inventoryError ?? new Error('Could not create Etsy inventory fixture')
    inventoryItemId = inventoryItem.id

    const { data: product, error: productError } = await admin
      .from('products')
      .insert({ owner_id: ownerAId, name: `Etsy RLS Product ${suffix}`, product_name: `Etsy RLS Product ${suffix}` })
      .select('id')
      .single()
    if (productError || !product) throw productError ?? new Error('Could not create Product Factory fixture')
    productId = product.id

    const { data: build, error: buildError } = await admin
      .from('product_builds')
      .insert({
        owner_id: ownerAId,
        product_id: productId,
        version: 1,
        filename: 'etsy-rls.zip',
        file_size: 4,
        storage_path: `etsy-rls/${suffix}/build.zip`,
      })
      .select('id')
      .single()
    if (buildError || !build) throw buildError ?? new Error('Could not create build fixture')
    buildId = build.id

    const { data: release, error: releaseError } = await admin
      .from('product_releases')
      .insert({
        owner_id: ownerAId,
        product_id: productId,
        build_id: buildId,
        version: 1,
        bundle_storage_path: `etsy-rls/${suffix}/release.zip`,
        bundle_filename: 'etsy-rls-release.zip',
        bundle_size: 4,
        bundle_sha256: 'a'.repeat(64),
      })
      .select('id')
      .single()
    if (releaseError || !release) throw releaseError ?? new Error('Could not create release fixture')
    releaseId = release.id

    const { data: publication, error: publicationError } = await admin
      .from('etsy_release_publications')
      .insert({
        owner_id: ownerAId,
        connection_id: connectionId,
        release_id: releaseId,
        etsy_listing_id: shopId + 300,
        status: 'draft',
        request_snapshot: { title: 'fixture' },
        response_metadata: { listing_id: shopId + 300 },
      })
      .select('id')
      .single()
    if (publicationError || !publication) throw publicationError ?? new Error('Could not create publication fixture')
    publicationId = publication.id
  })

  afterAll(async () => {
    if (!admin) return
    await admin.from('etsy_release_publications').delete().eq('id', publicationId)
    await admin.from('product_releases').delete().eq('id', releaseId)
    await admin.from('product_builds').delete().eq('id', buildId)
    await admin.from('products').delete().eq('id', productId)
    await admin.from('etsy_inventory_items').delete().eq('id', inventoryItemId)
    await admin.from('etsy_oauth_states').delete().eq('state_hash', stateHash)
    await admin.from('etsy_connection_secrets').delete().eq('connection_id', connectionId)
    await admin.from('etsy_connections').delete().eq('id', connectionId)
  })

  it('allows owner A to read safe Etsy metadata but blocks token and OAuth-state tables', async () => {
    const connectionRead = await ownerA
      .from('etsy_connections')
      .select('id, owner_id, shop_id, shop_name, status')
      .eq('id', connectionId)
      .single()
    expect(connectionRead.error).toBeNull()
    expect(connectionRead.data?.owner_id).toBe(ownerAId)

    const inventoryRead = await ownerA
      .from('etsy_inventory_items')
      .select('id, owner_id, etsy_listing_id')
      .eq('id', inventoryItemId)
      .single()
    expect(inventoryRead.error).toBeNull()
    expect(inventoryRead.data?.owner_id).toBe(ownerAId)

    const secretRead = await ownerA
      .from('etsy_connection_secrets')
      .select('connection_id, access_token_ciphertext, refresh_token_ciphertext')
      .eq('connection_id', connectionId)
    expect(secretRead.data).toBeNull()
    expect(secretRead.error).toBeTruthy()

    const stateRead = await ownerA
      .from('etsy_oauth_states')
      .select('state_hash, code_verifier_ciphertext')
      .eq('state_hash', stateHash)
    expect(stateRead.data).toBeNull()
    expect(stateRead.error).toBeTruthy()
  })

  it('returns no owner A Etsy metadata to owner B', async () => {
    const [connectionRead, inventoryRead, publicationRead] = await Promise.all([
      ownerB.from('etsy_connections').select('id').eq('id', connectionId),
      ownerB.from('etsy_inventory_items').select('id').eq('id', inventoryItemId),
      ownerB.from('etsy_release_publications').select('id').eq('id', publicationId),
    ])

    expect(connectionRead.error).toBeNull()
    expect(connectionRead.data).toEqual([])
    expect(inventoryRead.error).toBeNull()
    expect(inventoryRead.data).toEqual([])
    expect(publicationRead.error).toBeNull()
    expect(publicationRead.data).toEqual([])
  })

  it('rejects a cross-owner manual match even when owner B supplies its own owner_id', async () => {
    const crossOwnerInsert = await ownerB
      .from('etsy_product_matches')
      .insert({
        owner_id: ownerBId,
        product_id: productId,
        inventory_item_id: inventoryItemId,
        match_method: 'manual',
      })
      .select('id')

    expect(crossOwnerInsert.data).toBeNull()
    expect(crossOwnerInsert.error).toBeTruthy()
  })
})
