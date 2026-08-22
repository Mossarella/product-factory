import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertPaidFeature, EntitlementError, getEntitlement } from '@/lib/entitlements'
import {
  createEtsyAdminClient,
  decryptSecret,
  encryptSecret,
  fetchEtsyListingInventory,
  fetchEtsyShopListings,
  getEtsyConfig,
  refreshEtsyToken,
} from '@/lib/etsy/oauth'

export const runtime = 'nodejs'

const REFRESH_WINDOW_MS = 60_000

type JsonRecord = Record<string, unknown>

type Connection = { id: string; shop_id: number; status: string }
type Secret = { connection_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string; access_token_expires_at: string }

type InventoryProduct = {
  sku?: string[]
  offerings?: Array<{ quantity?: number; is_enabled?: boolean; price?: { amount?: number; divisor?: number; currency_code?: string } }>
}

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

function normalizeInventory(listing: { listing_id: number; title?: string; state?: string; skus?: string[]; price?: { amount?: number; divisor?: number; currency_code?: string } }, inventory: { products?: InventoryProduct[] }) {
  const products = inventory.products ?? []
  const offerings = products.flatMap((product) => product.offerings ?? [])
  const enabledOfferings = offerings.filter((offering) => offering.is_enabled !== false)
  const quantity = enabledOfferings.length > 0
    ? enabledOfferings.reduce((total, offering) => total + (offering.quantity ?? 0), 0)
    : offerings.reduce((total, offering) => total + (offering.quantity ?? 0), 0)
  const price = enabledOfferings[0]?.price ?? listing.price
  const divisor = price?.divisor || 1

  return {
    etsy_listing_id: listing.listing_id,
    title: listing.title || `Etsy listing ${listing.listing_id}`,
    state: listing.state || 'unknown',
    sku: products.flatMap((product) => product.sku ?? [])[0] ?? listing.skus?.[0] ?? null,
    price: price?.amount == null ? null : price.amount / divisor,
    quantity: offerings.length === 0 ? null : quantity,
    currency: price?.currency_code ?? null,
    listing_payload: listing as unknown as JsonRecord,
    inventory_payload: inventory as unknown as JsonRecord,
    last_synced_at: new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return errorResponse('Authentication required', 'AUTH_REQUIRED', 401)
    try {
      assertPaidFeature(await getEntitlement(supabase))
    } catch (error) {
      if (error instanceof EntitlementError) return errorResponse('A paid plan is required for Etsy inventory sync', 'PAID_PLAN_REQUIRED', 403)
      throw error
    }

    const config = getEtsyConfig(new URL(request.url).origin)
    const admin = createEtsyAdminClient()
    const { data: connection, error: connectionError } = await admin
      .from('etsy_connections')
      .select('id, shop_id, status')
      .eq('owner_id', user.id)
      .eq('status', 'connected')
      .maybeSingle() as { data: Connection | null; error: { message: string } | null }
    if (connectionError || !connection) return errorResponse('Etsy shop is not connected', 'ETSY_NOT_CONNECTED', 409)
    if (config.allowedShopId && String(connection.shop_id) !== config.allowedShopId) return errorResponse('Connected Etsy shop is not allowed', 'ETSY_SHOP_NOT_ALLOWED', 403)

    const { data: sync, error: syncInsertError } = await admin.from('etsy_inventory_syncs').insert({
      owner_id: user.id,
      connection_id: connection.id,
      status: 'running',
    }).select('id').single()
    if (syncInsertError || !sync) throw new Error('Could not start Etsy inventory sync')

    try {
      const { data: secret, error: secretError } = await admin
        .from('etsy_connection_secrets')
        .select('connection_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at')
        .eq('connection_id', connection.id)
        .single() as { data: Secret | null; error: { message: string } | null }
      if (secretError || !secret) throw new Error('Etsy credentials are unavailable')

      let accessToken = decryptSecret(secret.access_token_ciphertext)
      if (new Date(secret.access_token_expires_at).getTime() <= Date.now() + REFRESH_WINDOW_MS) {
        const refreshed = await refreshEtsyToken(config, decryptSecret(secret.refresh_token_ciphertext))
        accessToken = refreshed.access_token
        const { error: tokenUpdateError } = await admin.from('etsy_connection_secrets').update({
          access_token_ciphertext: encryptSecret(refreshed.access_token),
          refresh_token_ciphertext: encryptSecret(refreshed.refresh_token),
          access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('connection_id', connection.id)
        if (tokenUpdateError) throw new Error('Could not save refreshed Etsy credentials')
      }

      const listings = await fetchEtsyShopListings(config, accessToken, connection.shop_id)
      const items = []
      for (const listing of listings) {
        const inventory = await fetchEtsyListingInventory(config, accessToken, listing.listing_id)
        items.push({
          owner_id: user.id,
          connection_id: connection.id,
          ...normalizeInventory(listing, inventory),
        })
      }
      if (items.length > 0) {
        const { error: upsertError } = await admin.from('etsy_inventory_items').upsert(items, { onConflict: 'connection_id,etsy_listing_id' })
        if (upsertError) throw new Error('Could not save Etsy inventory')
      }

      const { error: syncUpdateError } = await admin.from('etsy_inventory_syncs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        items_seen: listings.length,
        items_upserted: items.length,
        error_message: null,
      }).eq('id', sync.id).eq('owner_id', user.id)
      if (syncUpdateError) throw new Error('Could not save Etsy sync status')

      await admin.from('etsy_connections').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', connection.id).eq('owner_id', user.id)
      return NextResponse.json({ syncId: sync.id, status: 'completed', itemsSeen: listings.length, itemsUpserted: items.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Etsy inventory sync failed'
      await admin.from('etsy_inventory_syncs').update({ status: 'failed', finished_at: new Date().toISOString(), error_message: message.slice(0, 500) }).eq('id', sync.id).eq('owner_id', user.id)
      await admin.from('etsy_connections').update({ last_error: message.slice(0, 500) }).eq('id', connection.id).eq('owner_id', user.id)
      return errorResponse(message, 'ETSY_SYNC_FAILED', 502)
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Etsy inventory sync failed', 'ETSY_SYNC_FAILED', 502)
  }
}
