import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SAMPLE_PRODUCTS } from '@/lib/sample-products'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const names = SAMPLE_PRODUCTS.map((sample) => sample.name)
    const { data: existingProducts, error: existingError } = await supabase
      .from('products')
      .select('name')
      .eq('owner_id', user.id)
      .in('name', names)

    if (existingError) throw existingError
    const existingNames = new Set((existingProducts ?? []).map((product) => product.name))

    const rows = SAMPLE_PRODUCTS.map((sample) => ({
      owner_id: user.id,
      name: sample.name,
      sku: sample.sku,
      product_name: sample.productName,
      etsy_title: sample.etsyTitle,
      description: sample.description,
      notes: sample.notes,
      contact: sample.contact,
      price: sample.price,
      currency: sample.currency,
      license_type: sample.licenseType,
      commercial_price: sample.commercialPrice ?? null,
      folders: sample.folders,
      etsy_tags: sample.etsyTags,
      complete: false,
    }))

    const { error: upsertError } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'owner_id,name' })

    if (upsertError) throw upsertError

    const existing = SAMPLE_PRODUCTS.filter((sample) => existingNames.has(sample.name)).length
    return NextResponse.json({
      created: SAMPLE_PRODUCTS.length - existing,
      existing,
      products: names,
    })
  } catch (error) {
    console.error('[sample-products] failed to load sample collection', error)
    return NextResponse.json({ error: 'Could not load the sample collection' }, { status: 500 })
  }
}
