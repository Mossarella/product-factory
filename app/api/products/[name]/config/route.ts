import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ name: string }>
}

async function getConfig(supabase: Awaited<ReturnType<typeof createClient>>, ownerId: string, productName: string) {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('name', productName)
    .maybeSingle()

  if (productError) throw productError
  if (!product) return null

  const [{ data: files, error: filesError }, { data: fixedAssetFiles, error: assetsError }, { data: builds, error: buildsError }] = await Promise.all([
    supabase.from('product_files').select('*').eq('owner_id', ownerId).eq('product_id', product.id).order('created_at', { ascending: true }),
    supabase.from('fixed_asset_files').select('*').eq('owner_id', ownerId).eq('product_id', product.id).order('created_at', { ascending: true }),
    supabase.from('product_builds').select('version, created_at').eq('owner_id', ownerId).eq('product_id', product.id).order('version', { ascending: false }).limit(1),
  ])

  if (filesError) throw filesError
  if (assetsError) throw assetsError
  if (buildsError) throw buildsError

  return {
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
    mascotFiles: (files ?? []).map((file) => ({
      id: file.id,
      filename: file.filename,
      origName: file.original_name,
      folder: file.folder,
      variant: file.variant,
    })),
    fixedAssetFiles: (fixedAssetFiles ?? []).map((file) => ({
      id: file.id,
      assetKey: file.asset_key,
      filename: file.filename,
      origName: file.original_name,
    })),
    etsyTags: product.etsy_tags,
    templateId: product.template_id,
    latestBuild: builds?.[0] ? { version: builds[0].version, createdAt: builds[0].created_at } : null,
    complete: product.complete,
    createdAt: product.created_at,
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const config = await getConfig(supabase, user.id, decodeURIComponent(name))
  if (!config) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  return NextResponse.json(config)
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const productName = decodeURIComponent(name)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(await request.text()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data: product, error: productError } = await supabase
    .from('products')
    .upsert({
      owner_id: user.id,
      name: productName,
      sku: (body.sku as string) ?? '',
      product_name: (body.productName as string) ?? productName,
      etsy_title: (body.etsyTitle as string) ?? '',
      description: (body.description as string) ?? '',
      notes: (body.notes as string) ?? '',
      contact: (body.contact as string) ?? '',
      price: (body.price as number) ?? 0,
      currency: (body.currency as string) ?? 'USD',
      license_type: (body.licenseType as string) ?? 'personal',
      commercial_price: (body.commercialPrice as number | null | undefined) ?? null,
      folders: (body.folders as string[]) ?? ['Main'],
      etsy_tags: (body.etsyTags as string[]) ?? [],
      template_id: (body.templateId as string | null | undefined) ?? null,
      complete: (body.complete as boolean) ?? false,
    }, { onConflict: 'owner_id,name' })
    .select('id')
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: productError?.message ?? 'Could not save product' }, { status: 500 })
  }

  const mascotFiles = (body.mascotFiles as Array<{ id?: string; filename: string; origName: string; folder: string; variant: string }>) ?? []
  const fixedAssetFiles = (body.fixedAssetFiles as Array<{ id?: string; assetKey: string; filename: string; origName: string }>) ?? []

  const { error: deleteFilesError } = await supabase.from('product_files').delete().eq('owner_id', user.id).eq('product_id', product.id)
  if (deleteFilesError) return NextResponse.json({ error: deleteFilesError.message }, { status: 500 })
  if (mascotFiles.length > 0) {
    const { error } = await supabase.from('product_files').insert(mascotFiles.map((file) => ({
      ...(file.id ? { id: file.id } : {}),
      owner_id: user.id,
      product_id: product.id,
      filename: file.filename,
      original_name: file.origName,
      folder: file.folder,
      variant: file.variant,
    })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error: deleteAssetsError } = await supabase.from('fixed_asset_files').delete().eq('owner_id', user.id).eq('product_id', product.id)
  if (deleteAssetsError) return NextResponse.json({ error: deleteAssetsError.message }, { status: 500 })
  if (fixedAssetFiles.length > 0) {
    const { error } = await supabase.from('fixed_asset_files').insert(fixedAssetFiles.map((file) => ({
      ...(file.id ? { id: file.id } : {}),
      owner_id: user.id,
      product_id: product.id,
      asset_key: file.assetKey,
      filename: file.filename,
      original_name: file.origName,
    })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const config = await getConfig(supabase, user.id, productName)
  return NextResponse.json(config)
}
