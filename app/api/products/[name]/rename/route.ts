import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeName } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const oldName = decodeURIComponent(name)
  const { newName } = (await request.json()) as { newName: string }
  const sanitizedNew = sanitizeName(newName ?? '')
  if (!sanitizedNew) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })

  const { data: existing, error: lookupError } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', oldName)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const { data: conflict, error: conflictError } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', sanitizedNew)
    .maybeSingle()
  if (conflictError) return NextResponse.json({ error: conflictError.message }, { status: 500 })
  if (conflict) return NextResponse.json({ error: 'Product already exists' }, { status: 409 })

  const { error: updateError } = await supabase
    .from('products')
    .update({ name: sanitizedNew })
    .eq('owner_id', user.id)
    .eq('id', existing.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: updated, error: updatedError } = await supabase
    .from('products')
    .select('name, sku, product_name, etsy_title, description, notes, contact, price, currency, license_type, commercial_price, folders, etsy_tags, complete, created_at')
    .eq('owner_id', user.id)
    .eq('id', existing.id)
    .single()
  if (updatedError) return NextResponse.json({ error: updatedError.message }, { status: 500 })

  const { data: files, error: filesError } = await supabase
    .from('product_files')
    .select('id, filename, original_name, folder, variant')
    .eq('owner_id', user.id)
    .eq('product_id', existing.id)
    .order('created_at', { ascending: true })
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })

  return NextResponse.json({
    name: updated.name,
    sku: updated.sku,
    productName: updated.product_name,
    etsyTitle: updated.etsy_title,
    description: updated.description,
    notes: updated.notes,
    contact: updated.contact,
    price: Number(updated.price),
    currency: updated.currency,
    licenseType: updated.license_type,
    commercialPrice: updated.commercial_price == null ? undefined : Number(updated.commercial_price),
    folders: updated.folders,
    mascotFiles: (files ?? []).map((file) => ({
      id: file.id,
      filename: file.filename,
      origName: file.original_name,
      folder: file.folder,
      variant: file.variant,
    })),
    etsyTags: updated.etsy_tags,
    complete: updated.complete,
    createdAt: updated.created_at,
  })
}
