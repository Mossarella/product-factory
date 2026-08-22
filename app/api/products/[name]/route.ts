import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const productName = decodeURIComponent(name)
  const { data: product, error: lookupError } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', productName)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const { error: deleteError } = await supabase
    .from('products')
    .delete()
    .eq('owner_id', user.id)
    .eq('id', product.id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
