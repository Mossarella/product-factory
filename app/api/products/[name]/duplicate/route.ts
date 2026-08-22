import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeName } from '@/lib/api-files'
import { PRODUCT_BUILDS_BUCKET, PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'

interface RouteContext {
  params: Promise<{ name: string }>
}

type DuplicateProductRow = {
  name: string
  sku: string | null
  product_name: string
  etsy_title: string
  description: string
  notes: string | null
  contact: string | null
  price: number | string
  currency: string
  license_type: string
  commercial_price: number | string | null
  folders: string[]
  etsy_tags: string[]
  template_id: string | null
  complete: boolean
  created_at: string
}

type DuplicateFileRow = {
  id?: string
  filename: string
  original_name: string
  folder?: string | null
  variant?: string | null
  asset_key?: string
}

function toConfig(product: DuplicateProductRow, files: DuplicateFileRow[], fixedAssetFiles: DuplicateFileRow[]) {
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
    mascotFiles: files.map((file) => ({ id: file.id, filename: file.filename, origName: file.original_name, folder: file.folder, variant: file.variant })),
    fixedAssetFiles: fixedAssetFiles.map((file) => ({ id: file.id, assetKey: file.asset_key, filename: file.filename, origName: file.original_name })),
    etsyTags: product.etsy_tags,
    templateId: product.template_id,
    complete: product.complete,
    createdAt: product.created_at,
  }
}

async function copyProductObjects(supabase: Awaited<ReturnType<typeof createClient>>, ownerId: string, sourceId: string, targetId: string) {
  const sourceRoot = `${ownerId}/${sourceId}`
  const targetRoot = `${ownerId}/${targetId}`
  for (const bucket of [PRODUCT_FILES_BUCKET, PRODUCT_BUILDS_BUCKET]) {
    const { data: folders, error: folderError } = await supabase.storage.from(bucket).list(sourceRoot, { limit: 1000 })
    if (folderError) throw folderError
    for (const entry of folders ?? []) {
      const sourcePath = `${sourceRoot}/${entry.name}`
      const targetPath = `${targetRoot}/${entry.name}`
      const { data: childEntries, error: childError } = await supabase.storage.from(bucket).list(sourcePath, { limit: 1000 })
      if (childError) throw childError
      const entries = childEntries && childEntries.length > 0 ? childEntries.map((child) => `${entry.name}/${child.name}`) : [entry.name]
      for (const relativePath of entries) {
        const fullSource = `${sourceRoot}/${relativePath}`
        const { data: object, error: downloadError } = await supabase.storage.from(bucket).download(fullSource)
        if (downloadError || !object) continue
        const { error: uploadError } = await supabase.storage.from(bucket).upload(`${targetRoot}/${relativePath}`, object, { contentType: object.type || 'application/octet-stream', upsert: true })
        if (uploadError) throw uploadError
      }
    }
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const sourceName = decodeURIComponent(name)
  const { newName } = await request.json() as { newName?: string }
  const sanitizedNew = sanitizeName(newName ?? '')
  if (!sanitizedNew) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })

  const { data: source, error: sourceError } = await supabase.from('products').select('*').eq('owner_id', user.id).eq('name', sourceName).maybeSingle()
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 })
  if (!source) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const [{ data: files, error: filesError }, { data: fixedAssetFiles, error: assetsError }] = await Promise.all([
    supabase.from('product_files').select('*').eq('owner_id', user.id).eq('product_id', source.id),
    supabase.from('fixed_asset_files').select('*').eq('owner_id', user.id).eq('product_id', source.id),
  ])
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })
  if (assetsError) return NextResponse.json({ error: assetsError.message }, { status: 500 })

  const { data: duplicate, error: duplicateError } = await supabase.from('products').insert({
    owner_id: user.id,
    name: sanitizedNew,
    sku: source.sku,
    product_name: source.product_name,
    etsy_title: source.etsy_title,
    description: source.description,
    notes: source.notes,
    contact: source.contact,
    price: source.price,
    currency: source.currency,
    license_type: source.license_type,
    commercial_price: source.commercial_price,
    folders: source.folders,
    etsy_tags: source.etsy_tags,
    template_id: source.template_id,
    complete: false,
  }).select('*').single()
  if (duplicateError || !duplicate) return NextResponse.json({ error: duplicateError?.message ?? 'Could not duplicate product' }, { status: 500 })

  const copiedFiles = (files ?? []).map(({ id: _id, storage_path: _path, ...file }) => ({ ...file, product_id: duplicate.id, owner_id: user.id }))
  const copiedAssets = (fixedAssetFiles ?? []).map(({ id: _id, storage_path: _path, ...file }) => ({ ...file, product_id: duplicate.id, owner_id: user.id }))
  if (copiedFiles.length) {
    const { error } = await supabase.from('product_files').insert(copiedFiles)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (copiedAssets.length) {
    const { error } = await supabase.from('fixed_asset_files').insert(copiedAssets)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await copyProductObjects(supabase, user.id, source.id, duplicate.id)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not copy product files' }, { status: 500 })
  }

  return NextResponse.json(toConfig(duplicate, copiedFiles, copiedAssets))
}
