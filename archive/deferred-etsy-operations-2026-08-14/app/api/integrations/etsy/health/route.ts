import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createEtsyAdminClient,
  decryptSecret,
  encryptSecret,
  fetchAuthorizedEtsy,
  getEtsyConfig,
  refreshEtsyToken,
} from '@/lib/etsy/oauth'
import { buildEtsyHealthPayload } from '@/lib/etsy/health'
import { verifyMonitorApiKey } from '@/lib/etsy/monitor-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LooseQuery {
  from(table: string): LooseQuery
  select(columns?: string): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>
  single(): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>
  update(values: Record<string, unknown>): LooseQuery
}

function asLooseQuery(client: unknown) {
  return client as LooseQuery
}

function elapsed(start: number) {
  return Math.max(0, Math.round(performance.now() - start))
}

export async function GET(request: Request) {
  const checkedAt = new Date().toISOString()
  const monitorAuth = verifyMonitorApiKey(request)
  let ownerId: string

  if (monitorAuth.kind === 'monitor') {
    ownerId = monitorAuth.ownerId
  } else {
    if (monitorAuth.kind === 'invalid-monitor' || request.headers.has('authorization')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const sessionClient = await createClient()
    const { data: userData, error: userError } = await sessionClient.auth.getUser()
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    ownerId = userData.user.id
  }
  const supabaseStarted = performance.now()
  let admin: ReturnType<typeof createEtsyAdminClient>
  try {
    admin = createEtsyAdminClient()
    const { error } = await asLooseQuery(admin)
      .from('etsy_connections')
      .select('id')
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (error) throw new Error(error.message ?? 'Supabase query failed')
  } catch {
    const payload = buildEtsyHealthPayload({
      checkedAt,
      supabase: { status: 'degraded', latencyMs: elapsed(supabaseStarted), message: 'Database health check failed' },
      etsy: { status: 'degraded', message: 'Etsy check was not attempted' },
    })
    return NextResponse.json(payload, { status: 503 })
  }

  let connection: Record<string, unknown> | null = null
  let secret: Record<string, unknown> | null = null
  const connectionResult = await asLooseQuery(admin)
    .from('etsy_connections')
    .select('id,shop_id,shop_name,status,access_token_expires_at')
    .eq('owner_id', ownerId)
    .eq('status', 'connected')
    .maybeSingle()
  connection = connectionResult.data

  const supabaseCheck = {
    status: 'healthy' as const,
    latencyMs: elapsed(supabaseStarted),
  }

  if (connectionResult.error || !connection) {
    const payload = buildEtsyHealthPayload({
      checkedAt,
      supabase: supabaseCheck,
      etsy: { status: 'unconfigured', message: 'No connected Etsy shop' },
    })
    return NextResponse.json(payload, { status: 503 })
  }

  const secretResult = await asLooseQuery(admin)
    .from('etsy_connection_secrets')
    .select('access_token_ciphertext,refresh_token_ciphertext')
    .eq('owner_id', ownerId)
    .eq('connection_id', connection.id)
    .maybeSingle()
  secret = secretResult.data

  const etsyStarted = performance.now()
  try {
    if (secretResult.error || !secret) throw new Error('Etsy credentials are unavailable')
    const config = getEtsyConfig()
    const refreshThreshold = Date.now() + 60_000
    let accessToken = decryptSecret(String(secret.access_token_ciphertext))
    const expiresAt = connection.access_token_expires_at ? Date.parse(String(connection.access_token_expires_at)) : 0
    if (expiresAt <= refreshThreshold) {
      const refreshed = await refreshEtsyToken(config, decryptSecret(String(secret.refresh_token_ciphertext)))
      accessToken = refreshed.access_token
      const nextExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await asLooseQuery(admin)
        .from('etsy_connection_secrets')
        .update({ access_token_ciphertext: encryptSecret(accessToken), refresh_token_ciphertext: encryptSecret(refreshed.refresh_token) })
        .eq('owner_id', ownerId)
        .eq('connection_id', connection.id)
      await asLooseQuery(admin)
        .from('etsy_connections')
        .update({ access_token_expires_at: nextExpiresAt, updated_at: new Date().toISOString(), last_error: null })
        .eq('owner_id', ownerId)
        .eq('id', connection.id)
    }

    const shopId = Number(connection.shop_id)
    await fetchAuthorizedEtsy(config, accessToken, `/shops/${shopId}`)
    const payload = buildEtsyHealthPayload({
      checkedAt,
      supabase: supabaseCheck,
      etsy: { status: 'healthy', latencyMs: elapsed(etsyStarted) },
      connection: {
        shopName: typeof connection.shop_name === 'string' ? connection.shop_name : null,
        shopId: String(connection.shop_id),
        tokenExpiresAt: typeof connection.access_token_expires_at === 'string' ? connection.access_token_expires_at : null,
      },
    })
    return NextResponse.json(payload, { status: 200 })
  } catch {
    const payload = buildEtsyHealthPayload({
      checkedAt,
      supabase: supabaseCheck,
      etsy: { status: 'degraded', latencyMs: elapsed(etsyStarted), message: 'Etsy API health check failed' },
      connection: {
        shopName: typeof connection.shop_name === 'string' ? connection.shop_name : null,
        shopId: String(connection.shop_id),
        tokenExpiresAt: typeof connection.access_token_expires_at === 'string' ? connection.access_token_expires_at : null,
      },
    })
    return NextResponse.json(payload, { status: 503 })
  }
}
