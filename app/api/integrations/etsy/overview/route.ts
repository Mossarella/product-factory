import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type LooseClient = {
  from: (table: string) => {
    select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => LooseQuery
  }
}

type LooseQuery = {
  eq: (column: string, value: unknown) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => LooseQuery
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
  then: Promise<unknown>['then']
}

interface ConnectionRow {
  status: string
  shop_name: string | null
  last_sync_at: string | null
  last_error: string | null
}

interface SyncRow {
  status: string
  items_seen: number
  items_upserted: number
  started_at: string
  completed_at: string | null
  error_message: string | null
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Authentication required', 401)

  const db = supabase as unknown as LooseClient
  const connectionQuery = db.from('etsy_connections').select('status, shop_name, last_sync_at, last_error').eq('owner_id', user.id).maybeSingle()
  const syncQuery = db.from('etsy_inventory_syncs').select('status, items_seen, items_upserted, started_at, completed_at, error_message').eq('owner_id', user.id).order('started_at', { ascending: false }).limit(1).maybeSingle()
  const inventoryQuery = db.from('etsy_inventory_items').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
  const matchesQuery = db.from('etsy_product_matches').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)

  const [connectionResult, syncResult, inventoryResult, matchesResult] = await Promise.all([
    connectionQuery,
    syncQuery,
    inventoryQuery as unknown as Promise<{ count?: number | null; error: { message: string } | null }>,
    matchesQuery as unknown as Promise<{ count?: number | null; error: { message: string } | null }>,
  ]) as [
    { data: unknown; error: { message: string } | null },
    { data: unknown; error: { message: string } | null },
    { count?: number | null; error: { message: string } | null },
    { count?: number | null; error: { message: string } | null },
  ]

  const queryError = connectionResult.error || syncResult.error || inventoryResult.error || matchesResult.error
  if (queryError) return fail(queryError.message, 500)

  const connection = connectionResult.data as ConnectionRow | null
  const latestSync = syncResult.data as SyncRow | null
  const syncStatus = latestSync?.status ?? (connection ? 'never_synced' : 'not_connected')

  return NextResponse.json({
    connected: Boolean(connection),
    shopName: connection?.shop_name ?? null,
    connectionStatus: connection?.status ?? 'not_connected',
    syncStatus,
    lastSyncAt: latestSync?.completed_at ?? latestSync?.started_at ?? connection?.last_sync_at ?? null,
    lastSyncError: latestSync?.error_message ?? connection?.last_error ?? null,
    itemsSeen: latestSync?.items_seen ?? 0,
    itemsUpserted: latestSync?.items_upserted ?? 0,
    cachedItems: inventoryResult.count ?? 0,
    matchedItems: matchesResult.count ?? 0,
  })
}

export const dynamic = 'force-dynamic'
