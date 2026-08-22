import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const webhookUrl = process.env.ETSY_WEBHOOK_URL
const signingSecret = process.env.ETSY_WEBHOOK_SIGNING_SECRET
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerAToken = process.env.SUPABASE_ISOLATION_ACCESS_TOKEN_A
const configured = Boolean(webhookUrl && signingSecret && url && anonKey && serviceRoleKey && ownerAToken)

const liveDescribe = configured ? describe : describe.skip

type TestClient = SupabaseClient

function authenticatedClient(accessToken: string) {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function signPayload(body: string, webhookId: string, timestamp: string) {
  const encodedSecret = signingSecret!.startsWith('whsec_')
    ? signingSecret!.slice('whsec_'.length)
    : signingSecret!
  const secret = Buffer.from(encodedSecret, 'base64')
  const signature = createHmac('sha256', secret)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest('base64')
  return `v1,${signature}`
}

async function postWebhook(body: string, headers: Record<string, string>) {
  return fetch(webhookUrl!, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

liveDescribe('live Etsy webhook receiver', () => {
  let ownerA: TestClient
  let admin: TestClient
  let ownerAId = ''
  let shopId = 0
  const deliveryId = `live-webhook-${Date.now()}`

  beforeAll(async () => {
    ownerA = authenticatedClient(ownerAToken!)
    admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: user, error: userError } = await ownerA.auth.getUser()
    if (userError || !user.user) throw userError ?? new Error('Live webhook test owner token is invalid')
    ownerAId = user.user.id

    const { data: connection, error: connectionError } = await ownerA
      .from('etsy_connections')
      .select('shop_id')
      .eq('owner_id', ownerAId)
      .eq('status', 'connected')
      .maybeSingle()
    if (connectionError || !connection) {
      throw connectionError ?? new Error('Live webhook test requires an active Etsy connection for owner A')
    }
    shopId = Number(connection.shop_id)
    if (!Number.isSafeInteger(shopId) || shopId <= 0) throw new Error('Live Etsy connection has an invalid shop ID')
  })

  afterAll(async () => {
    await admin
      .from('etsy_webhook_events')
      .delete()
      .eq('owner_id', ownerAId)
      .eq('delivery_id', deliveryId)
  })

  it('rejects a validly shaped webhook with an invalid signature', async () => {
    const payload = JSON.stringify({
      event_type: 'listing.updated',
      shop_id: shopId,
      resource_url: `shops/${shopId}/listings/1`,
    })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const response = await postWebhook(payload, {
      'webhook-id': `${deliveryId}-invalid`,
      'webhook-timestamp': timestamp,
      'webhook-signature': 'v1,invalid-signature',
    })

    expect(response.status).toBe(401)
  })

  it('accepts a valid signature and treats a repeated delivery as a duplicate', async () => {
    const payload = JSON.stringify({
      // Etsy documents order events; this unsupported event keeps the live test
      // independent of an Etsy API inventory refresh while exercising delivery auth.
      event_type: 'listing.updated',
      shop_id: shopId,
      resource_url: `shops/${shopId}/listings/1`,
    })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const webhookId = deliveryId
    const signature = signPayload(payload, webhookId, timestamp)
    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    }

    const first = await postWebhook(payload, headers)
    const firstBody = await first.json() as { duplicate?: boolean; status?: string }
    expect(first.status).toBe(200)
    expect(firstBody.duplicate).not.toBe(true)

    const second = await postWebhook(payload, headers)
    const secondBody = await second.json() as { duplicate?: boolean; status?: string }
    expect(second.status).toBe(200)
    expect(secondBody.duplicate).toBe(true)

    const { data: events, error } = await ownerA
      .from('etsy_webhook_events')
      .select('delivery_id,status,owner_id')
      .eq('delivery_id', deliveryId)
    expect(error).toBeNull()
    expect(events).toHaveLength(1)
    expect(events?.[0]).toMatchObject({ delivery_id: deliveryId, status: 'ignored', owner_id: ownerAId })
  })
})

void configured
void signPayload
void postWebhook
void liveDescribe

test('live Etsy webhook integration is credential-gated', () => {
  expect(typeof configured).toBe('boolean')
})

if (!configured) {
  console.info('Skipping live Etsy webhook tests: configure ETSY_WEBHOOK_URL, ETSY_WEBHOOK_SIGNING_SECRET, Supabase URL/keys, and SUPABASE_ISOLATION_ACCESS_TOKEN_A.')
}
