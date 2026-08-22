import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeName } from '@/lib/api-files'
import { assertProductCapacity, entitlementErrorResponse, getEntitlement } from '@/lib/entitlements'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: products, error } = await supabase
    .from('products')
    .select('name, complete, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    products.map((product) => ({
      name: product.name,
      complete: product.complete,
      createdAt: product.created_at,
    })),
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = (await request.json()) as { name: string }
  const sanitizedName = sanitizeName(name ?? '')
  if (!sanitizedName) {
    return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
  }

  try {
    const entitlement = await getEntitlement(supabase)
    assertProductCapacity(entitlement)
  } catch (error) {
    const response = entitlementErrorResponse(error)
    if (response) return response
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check product quota' }, { status: 500 })
  }

  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', sanitizedName)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Product already exists' }, { status: 409 })

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      owner_id: user.id,
      name: sanitizedName,
      sku: '',
      product_name: sanitizedName,
      etsy_title: '',
      description: '',
      notes: '',
      contact: '',
      price: 0,
      currency: 'USD',
      license_type: 'personal',
      folders: ['Main'],
      etsy_tags: [],
      complete: false,
    })
    .select('*')
    .single()

  if (error || !product) {
    return NextResponse.json({ error: error?.message ?? 'Could not create product' }, { status: 500 })
  }

  return NextResponse.json(
    {
      name: product.name,
      sku: product.sku,
      productName: product.product_name,
      etsyTitle: product.etsy_title,
      description: product.description,
      notes: product.notes,
      contact: product.contact,
      price: Number(product.price),
      currency: product.currency,
      licenseType: product.license_type,
      commercialPrice: product.commercial_price == null ? undefined : Number(product.commercial_price),
      folders: product.folders,
      mascotFiles: [],
      etsyTags: product.etsy_tags,
      complete: product.complete,
      createdAt: product.created_at,
    },
    { status: 201 },
  )
}
