import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type LooseQuery = {
  select(columns: string): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  order(column: string, options: { ascending: boolean }): LooseQuery
  limit(value: number): LooseQuery
  or(value: string): LooseQuery
  then<TResult>(onfulfilled?: (value: { data: unknown; error: { message: string } | null }) => TResult): Promise<TResult>
}

type LooseClient = { from(table: string): LooseQuery }

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, { status: 401 })

  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  const query = url.searchParams.get('q')?.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 100) || ''
  const db = supabase as unknown as LooseClient
  let builder = db
    .from('etsy_inventory_items')
    .select('id, etsy_listing_id, title, state, sku, price, quantity, currency, last_synced_at')
    .eq('owner_id', user.id)
    .order('last_synced_at', { ascending: false })
    .limit(200)
  if (state) builder = builder.eq('state', state)
  if (query) builder = builder.or(`title.ilike.%${query}%,sku.ilike.%${query}%`)

  const { data, error } = await builder
  if (error) return NextResponse.json({ error: 'Could not load Etsy inventory', code: 'INVENTORY_READ_FAILED' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
