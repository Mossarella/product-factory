import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertPaidFeature, EntitlementError, getEntitlement } from '@/lib/entitlements'
import {
  createEtsyAdminClient,
  createEtsyDraftListing,
  decryptSecret,
  encryptSecret,
  getEtsyConfig,
  refreshEtsyToken,
  uploadEtsyDigitalFile,
} from '@/lib/etsy/oauth'
import type { ReleaseListingSnapshot } from '@/lib/release-snapshot'

export const runtime = 'nodejs'

const REFRESH_WINDOW_MS = 60_000

type RouteParams = { params: Promise<{ name: string; version: string }> }
type JsonRecord = Record<string, unknown>

type ReleaseRow = {
  id: string
  owner_id: string
  product_id: string
  build_id: string
  version: number
  bundle_filename: string
  bundle_storage_path: string
  listing_snapshot: ReleaseListingSnapshot
  release_summary: JsonRecord
}

type EtsyConnectionRow = {
  id: string
  shop_id: number
  shop_name: string
}

type SecretRow = {
  connection_id: string
  access_token_ciphertext: string
  refresh_token_ciphertext: string
  access_token_expires_at: string
}

type PublicationRow = {
  id: string
  status: 'creating' | 'draft' | 'published' | 'failed'
  etsy_listing_id: number | null
  response_metadata: JsonRecord
}

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

function isListingSnapshot(value: unknown): value is ReleaseListingSnapshot {
  if (!value || typeof value !== 'object') return false
  const listing = value as Partial<ReleaseListingSnapshot>
  return typeof listing.productName === 'string'
    && typeof listing.sku === 'string'
    && typeof listing.title === 'string'
    && typeof listing.description === 'string'
    && Array.isArray(listing.tags)
    && listing.tags.every((tag) => typeof tag === 'string')
    && typeof listing.price === 'number'
    && Number.isFinite(listing.price)
    && typeof listing.currency === 'string'
    && typeof listing.licenseType === 'string'
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

async function parseDraftOptions(request: Request) {
  const body = await request.json().catch(() => ({})) as JsonRecord
  const taxonomyId = body.taxonomyId ?? Number(process.env.ETSY_DEFAULT_TAXONOMY_ID)
  if (!isPositiveInteger(taxonomyId)) throw new Error('taxonomy_id_required')
  const whoMade = body.whoMade === 'collective' || body.whoMade === 'someone_else' ? body.whoMade : 'i_did'
  const whenMade = typeof body.whenMade === 'string' && body.whenMade.length > 0 ? body.whenMade : '2020_2025'
  return { taxonomyId, whoMade, whenMade }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { name, version: versionParam } = await params
  const version = Number(versionParam)
  if (!Number.isSafeInteger(version) || version <= 0) return jsonError('Invalid release version', 'INVALID_VERSION', 400)

  try {
    const options = await parseDraftOptions(request)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('Authentication required', 'AUTH_REQUIRED', 401)
    try {
      assertPaidFeature(await getEntitlement(supabase))
    } catch (error) {
      if (error instanceof EntitlementError) return jsonError('A paid plan is required for Etsy publishing', 'PAID_PLAN_REQUIRED', 403)
      throw error
    }

    const config = getEtsyConfig(new URL(request.url).origin)
    const admin = createEtsyAdminClient()
    const decodedName = decodeURIComponent(name)
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, owner_id')
      .eq('owner_id', user.id)
      .eq('name', decodedName)
      .maybeSingle()
    if (productError || !product) return jsonError('Product not found', 'PRODUCT_NOT_FOUND', 404)

    const { data: release, error: releaseError } = await admin
      .from('product_releases')
      .select('id, owner_id, product_id, build_id, version, bundle_filename, bundle_storage_path, listing_snapshot, release_summary')
      .eq('owner_id', user.id)
      .eq('product_id', product.id)
      .eq('version', version)
      .maybeSingle() as { data: ReleaseRow | null; error: { message: string } | null }
    if (releaseError || !release) return jsonError('Release not found', 'RELEASE_NOT_FOUND', 404)
    if (!isListingSnapshot(release.listing_snapshot)) return jsonError('Release listing snapshot is invalid', 'RELEASE_SNAPSHOT_INVALID', 422)

    const { data: connection, error: connectionError } = await admin
      .from('etsy_connections')
      .select('id, shop_id, shop_name')
      .eq('owner_id', user.id)
      .eq('status', 'connected')
      .maybeSingle() as { data: EtsyConnectionRow | null; error: { message: string } | null }
    if (connectionError || !connection) return jsonError('Etsy shop is not connected', 'ETSY_NOT_CONNECTED', 409)
    if (config.allowedShopId && String(connection.shop_id) !== config.allowedShopId) return jsonError('Connected Etsy shop is not allowed', 'ETSY_SHOP_NOT_ALLOWED', 403)

    const { data: existing, error: existingError } = await admin
      .from('etsy_release_publications')
      .select('id, status, etsy_listing_id, response_metadata')
      .eq('owner_id', user.id)
      .eq('connection_id', connection.id)
      .eq('release_id', release.id)
      .maybeSingle() as { data: PublicationRow | null; error: { message: string } | null }
    if (existingError) throw new Error('Could not read Etsy publication status')
    if (existing?.status === 'draft' || existing?.status === 'published') {
      return NextResponse.json({ created: false, publication: existing })
    }
    if (existing?.status === 'creating') return jsonError('An Etsy draft is already being created', 'PUBLICATION_IN_PROGRESS', 409)

    const requestSnapshot = {
      title: release.listing_snapshot.title,
      description: release.listing_snapshot.description,
      price: release.listing_snapshot.price,
      currency: release.listing_snapshot.currency,
      tags: release.listing_snapshot.tags,
      taxonomyId: options.taxonomyId,
      whoMade: options.whoMade,
      whenMade: options.whenMade,
      type: 'download',
      state: 'draft',
    }

    let publicationId = existing?.id
    if (publicationId) {
      const { error } = await admin.from('etsy_release_publications').update({
        status: 'creating',
        error_message: null,
        request_snapshot: requestSnapshot,
      }).eq('id', publicationId).eq('owner_id', user.id)
      if (error) throw new Error('Could not retry Etsy publication')
    } else {
      const { data: publication, error } = await admin.from('etsy_release_publications').insert({
        owner_id: user.id,
        connection_id: connection.id,
        release_id: release.id,
        status: 'creating',
        request_snapshot: requestSnapshot,
      }).select('id').single()
      if (error || !publication) {
        const { data: raced } = await admin.from('etsy_release_publications')
          .select('id, status, etsy_listing_id, response_metadata')
          .eq('owner_id', user.id)
          .eq('connection_id', connection.id)
          .eq('release_id', release.id)
          .maybeSingle()
        if (raced?.status === 'draft' || raced?.status === 'published') return NextResponse.json({ created: false, publication: raced })
        if (raced?.status === 'creating') return jsonError('An Etsy draft is already being created', 'PUBLICATION_IN_PROGRESS', 409)
        throw new Error('Could not initialize Etsy publication')
      }
      publicationId = publication.id
    }

    const { data: secret, error: secretError } = await admin
      .from('etsy_connection_secrets')
      .select('connection_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at')
      .eq('connection_id', connection.id)
      .single() as { data: SecretRow | null; error: { message: string } | null }
    if (secretError || !secret) throw new Error('Etsy credentials are unavailable')

    let accessToken = decryptSecret(secret.access_token_ciphertext)
    if (new Date(secret.access_token_expires_at).getTime() <= Date.now() + REFRESH_WINDOW_MS) {
      const refreshed = await refreshEtsyToken(config, decryptSecret(secret.refresh_token_ciphertext))
      accessToken = refreshed.access_token
      await admin.from('etsy_connection_secrets').update({
        access_token_ciphertext: encryptSecret(refreshed.access_token),
        refresh_token_ciphertext: encryptSecret(refreshed.refresh_token),
        access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('connection_id', connection.id)
    }

    try {
      const draft = await createEtsyDraftListing(config, accessToken, {
        shopId: connection.shop_id,
        title: release.listing_snapshot.title,
        description: release.listing_snapshot.description,
        price: release.listing_snapshot.price,
        tags: release.listing_snapshot.tags,
        taxonomyId: options.taxonomyId,
        whoMade: options.whoMade,
        whenMade: options.whenMade,
      })
      const releaseBundle = await admin.storage.from('product-builds').download(release.bundle_storage_path)
      if (releaseBundle.error || !releaseBundle.data) throw new Error('Product release bundle is unavailable')

      const file = await uploadEtsyDigitalFile(config, accessToken, {
        shopId: connection.shop_id,
        listingId: Number(draft.listing_id),
        filename: release.bundle_filename,
        blob: releaseBundle.data,
      })
      const { data: publication, error: publicationError } = await admin.from('etsy_release_publications').update({
        status: 'draft',
        etsy_listing_id: Number(draft.listing_id),
        response_metadata: { listing: draft, file },
        error_message: null,
      }).eq('id', publicationId).eq('owner_id', user.id).select('id, status, etsy_listing_id, response_metadata').single()
      if (publicationError || !publication) throw new Error('Could not save Etsy publication')
      return NextResponse.json({ created: true, publication })
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : 'Etsy draft publication failed'
      await admin.from('etsy_release_publications').update({
        status: 'failed',
        error_message: safeMessage.slice(0, 500),
      }).eq('id', publicationId).eq('owner_id', user.id)
      return jsonError(safeMessage, 'ETSY_DRAFT_FAILED', 502)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'taxonomy_id_required') return jsonError('An Etsy taxonomy ID is required', 'TAXONOMY_REQUIRED', 422)
    return jsonError(error instanceof Error ? error.message : 'Etsy draft publication failed', 'ETSY_DRAFT_FAILED', 502)
  }
}
