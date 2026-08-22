import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeStats } from '@/lib/dashboard-stats'
import { aggregateDashboardEvents } from '@/lib/dashboard-events'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: products, error: productsError } = await supabase.from('products').select('id, name, complete, description, etsy_title, etsy_tags, created_at').eq('owner_id', user.id).order('created_at', { ascending: false })
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 })
  const productRows = products ?? []
  const productIds = productRows.map((product) => product.id)
  const { data: files, error: filesError } = productIds.length
    ? await supabase.from('product_files').select('id, product_id, original_name').eq('owner_id', user.id).in('product_id', productIds)
    : { data: [], error: null }
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })

  const { data: eventRows, error: eventsError } = await supabase.from('product_events').select('event_type, created_at, metadata').eq('owner_id', user.id).in('event_type', ['package_created', 'asset_reused']).order('created_at', { ascending: false })
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })
  const eventMetrics = aggregateDashboardEvents((eventRows ?? []).map((event) => ({
    eventType: event.event_type as 'package_created' | 'asset_reused',
    createdAt: event.created_at,
    metadata: (event.metadata ?? {}) as Record<string, unknown>,
  })))

  const stats = await computeStats(productRows.map((product) => ({
    id: product.id,
    name: product.name,
    complete: Boolean(product.complete),
    description: product.description ?? '',
    etsyTitle: product.etsy_title ?? '',
    etsyTags: product.etsy_tags ?? [],
    createdAt: product.created_at,
    files: (files ?? []).filter((file) => file.product_id === product.id).map((file) => ({ id: file.id, origName: file.original_name })),
  })), async (product) => {
    const { data: object } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(productStoragePath(user.id, product.id, 'etsy-slots', 'etsy-hero'))
    return !object
  })

  return NextResponse.json({ ...stats, ...eventMetrics })
}
