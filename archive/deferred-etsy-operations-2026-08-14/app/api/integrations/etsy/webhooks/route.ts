import { NextResponse } from 'next/server'
import {
  createEtsyAdminClient,
  decryptSecret,
  encryptSecret,
  fetchEtsyListingInventory,
  fetchEtsyShopListings,
  getEtsyConfig,
  getEtsyWebhookSigningSecret,
  refreshEtsyToken,
  verifyEtsyWebhookSignature,
} from '@/lib/etsy/oauth'

export const runtime = 'nodejs'

const REFRESH_WINDOW_MS = 60_000
const SUPPORTED_EVENTS = new Set(['order.paid', 'order.canceled', 'order.shipped', 'order.delivered'])

type JsonRecord = Record<string, unknown>
type Connection = { id: string; owner_id: string; shop_id: number; status: string }
type Secret = { connection_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string; access_token_expires_at: string }
type InventoryProduct = {
  sku?: string[]
  offerings?: Array<{ quantity?: number; is_enabled?: boolean; price?: { amount?: number; divisor?: number; currency_code?: string } }>
}

type Listing = {
  listing_id: number
  title?: string
  state?: string
  skus?: string[]
  price?: { amount?: number; divisor?: number; currency_code?: string }
}

function response(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

function normalizeInventory(listing: Listing, inventory: { products?: InventoryProduct[] }) {
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

async function refreshInventory(admin: ReturnType<typeof createEtsyAdminClient>, connection: Connection, config: ReturnType<typeof getEtsyConfig>) {
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
    const { error } = await admin.from('etsy_connection_secrets').update({
      access_token_ciphertext: encryptSecret(refreshed.access_token),
      refresh_token_ciphertext: encryptSecret(refreshed.refresh_token),
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('connection_id', connection.id)
    if (error) throw new Error('Could not save refreshed Etsy credentials')
  }

  const listings = await fetchEtsyShopListings(config, accessToken, connection.shop_id)
  const items = []
  for (const listing of listings) {
    const inventory = await fetchEtsyListingInventory(config, accessToken, listing.listing_id)
    items.push({
      owner_id: connection.owner_id,
      connection_id: connection.id,
      ...normalizeInventory(listing, inventory),
    })
  }
  if (items.length > 0) {
    const { error } = await admin.from('etsy_inventory_items').upsert(items, { onConflict: 'connection_id,etsy_listing_id' })
    if (error) throw new Error('Could not save Etsy inventory')
  }

  const now = new Date().toISOString()
  await admin.from('etsy_connections').update({ last_synced_at: now, last_error: null }).eq('id', connection.id).eq('owner_id', connection.owner_id)
  return { itemsSeen: listings.length, itemsUpserted: items.length }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const webhookId = request.headers.get('webhook-id')
  const webhookTimestamp = request.headers.get('webhook-timestamp')
  const webhookSignature = request.headers.get('webhook-signature')
  if (!webhookId || !webhookTimestamp || !webhookSignature) return response('Webhook signature headers are required', 'WEBHOOK_SIGNATURE_REQUIRED', 400)

  try {
    if (!verifyEtsyWebhookSignature({
      body: rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      signingSecret: getEtsyWebhookSigningSecret(),
    })) return response('Webhook signature is invalid or expired', 'WEBHOOK_SIGNATURE_INVALID', 401)

    const payload = JSON.parse(rawBody) as { event_type?: string; resource_url?: string; shop_id?: number }
    if (!payload.event_type || !Number.isSafeInteger(payload.shop_id)) return response('Webhook payload is invalid', 'WEBHOOK_PAYLOAD_INVALID', 400)

    const admin = createEtsyAdminClient()
    const { data: connection, error: connectionError } = await admin
      .from('etsy_connections')
      .select('id, owner_id, shop_id, status')
      .eq('shop_id', payload.shop_id)
      .eq('status', 'connected')
      .maybeSingle() as { data: Connection | null; error: { message: string } | null }
    if (connectionError || !connection) return response('Webhook shop is not connected', 'WEBHOOK_SHOP_NOT_CONNECTED', 404)

    const config = getEtsyConfig(new URL(request.url).origin)
    if (config.allowedShopId && String(connection.shop_id) !== config.allowedShopId) return response('Webhook shop is not allowed', 'WEBHOOK_SHOP_NOT_ALLOWED', 403)

    const { data: existing } = await admin.from('etsy_webhook_events')
      .select('id, status')
      .eq('owner_id', connection.owner_id)
      .eq('delivery_id', webhookId)
      .maybeSingle() as { data: { id: string; status: string } | null }
    if (existing) return NextResponse.json({ accepted: true, duplicate: true, status: existing.status })

    const { data: event, error: insertError } = await admin.from('etsy_webhook_events').insert({
      owner_id: connection.owner_id,
      connection_id: connection.id,
      delivery_id: webhookId,
      event_type: payload.event_type,
      shop_id: payload.shop_id,
      resource_url: payload.resource_url ?? null,
      status: SUPPORTED_EVENTS.has(payload.event_type) ? 'received' : 'ignored',
      payload,
    }).select('id').single()
    if (insertError || !event) throw new Error('Could not persist Etsy webhook event')

    if (!SUPPORTED_EVENTS.has(payload.event_type)) {
      return NextResponse.json({ accepted: true, status: 'ignored', eventType: payload.event_type })
    }

    try {
      const sync = await refreshInventory(admin, connection, config)
      await admin.from('etsy_webhook_events').update({ status: 'processed', processed_at: new Date().toISOString(), error_message: null }).eq('id', event.id)
      return NextResponse.json({ accepted: true, status: 'processed', eventType: payload.event_type, ...sync })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Etsy webhook inventory refresh failed'
      await admin.from('etsy_webhook_events').update({ status: 'failed', processed_at: new Date().toISOString(), error_message: message.slice(0, 500) }).eq('id', event.id)
      return response(message, 'WEBHOOK_PROCESSING_FAILED', 502)
    }
  } catch (error) {
    if (error instanceof SyntaxError) return response('Webhook payload is invalid JSON', 'WEBHOOK_PAYLOAD_INVALID', 400)
    return response(error instanceof Error ? error.message : 'Etsy webhook processing failed', 'WEBHOOK_PROCESSING_FAILED', 502)
  }
}
