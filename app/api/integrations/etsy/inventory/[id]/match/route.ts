import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

type LooseQuery = {
  select(columns: string): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
  upsert(values: Record<string, unknown>, options: { onConflict: string }): LooseQuery
  delete(): LooseQuery
  single(): Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  then<TResult>(onfulfilled?: (value: { data: unknown; error: { message: string; code?: string } | null }) => TResult): Promise<TResult>
}

type LooseClient = { from(table: string): LooseQuery }

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: inventoryItemId } = await params
  const body = await request.json().catch(() => ({})) as { productId?: unknown; productName?: unknown }
  const productKey = typeof body.productId === 'string' && body.productId.length > 0 ? body.productId : typeof body.productName === 'string' && body.productName.length > 0 ? body.productName : null
  if (!productKey) return errorResponse('Product ID or name is required', 'PRODUCT_REQUIRED', 400)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('Authentication required', 'AUTH_REQUIRED', 401)

  const db = supabase as unknown as LooseClient
  const [{ data: inventoryItem, error: inventoryError }, { data: product, error: productError }] = await Promise.all([
    db.from('etsy_inventory_items').select('id, owner_id, title, etsy_listing_id').eq('id', inventoryItemId).eq('owner_id', user.id).maybeSingle(),
    (typeof body.productId === 'string' ? db.from('products').select('id, owner_id, name, product_name').eq('id', productKey) : db.from('products').select('id, owner_id, name, product_name').eq('name', productKey)).eq('owner_id', user.id).maybeSingle(),
  ])
  const ownedInventoryItem = inventoryItem as { id: string; owner_id: string; title: string; etsy_listing_id: number } | null
  const ownedProduct = product as { id: string; owner_id: string; name: string; product_name: string } | null
  if (inventoryError || !ownedInventoryItem) return errorResponse('Etsy inventory item not found', 'INVENTORY_NOT_FOUND', 404)
  if (productError || !ownedProduct) return errorResponse('Product not found', 'PRODUCT_NOT_FOUND', 404)

  const { data, error } = await db.from('etsy_product_matches').upsert({
    owner_id: user.id,
    product_id: ownedProduct.id,
    inventory_item_id: ownedInventoryItem.id,
    match_method: 'manual',
  }, { onConflict: 'inventory_item_id' }).select('id, owner_id, product_id, inventory_item_id, match_method, created_at, updated_at').single()
  if (error) {
    if (error.code === '23505') return errorResponse('Product or Etsy listing is already matched', 'MATCH_ALREADY_EXISTS', 409)
    return errorResponse('Could not save Etsy product match', 'MATCH_SAVE_FAILED', 500)
  }
  return NextResponse.json({ match: data, product: ownedProduct, inventoryItem: ownedInventoryItem })
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: inventoryItemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('Authentication required', 'AUTH_REQUIRED', 401)

  const db = supabase as unknown as LooseClient
  const { error } = await db.from('etsy_product_matches')
    .delete()
    .eq('owner_id', user.id)
    .eq('inventory_item_id', inventoryItemId)
  if (error) return errorResponse('Could not remove Etsy product match', 'MATCH_DELETE_FAILED', 500)
  return NextResponse.json({ removed: true })
}
