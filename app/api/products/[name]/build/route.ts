import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CONFIG } from '@/config'
import { PRODUCT_BUILDS_BUCKET, PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import { buildZipBuffer } from '@/lib/zip-server'
import { generateChangelog } from '@/lib/build-changelog'
import { resolveTemplateData } from '@/lib/templates'
import { buildReadmeText } from '@/lib/templates-server'
import { validateProduct } from '@/lib/template-rules'
import type { TemplateRule } from '@/lib/template-rules'
import type { BuildManifest } from '@/lib/zip-server'
import type { ProductConfig } from '@/lib/types'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const productName = decodeURIComponent(name)
  const { data: product, error: productError } = await supabase.from('products').select('*').eq('owner_id', user.id).eq('name', productName).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const [{ data: files, error: filesError }, { data: fixedAssetFiles, error: assetsError }, { data: template, error: templateError }, { data: profile, error: profileError }, { data: builds, error: buildsError }] = await Promise.all([
    supabase.from('product_files').select('*').eq('owner_id', user.id).eq('product_id', product.id).order('created_at', { ascending: true }),
    supabase.from('fixed_asset_files').select('*').eq('owner_id', user.id).eq('product_id', product.id).order('created_at', { ascending: true }),
    product.template_id ? supabase.from('product_templates').select('*').eq('owner_id', user.id).eq('id', product.template_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('profiles').select('display_name, shop_name, shop_contact, shop_description, readme_footer').eq('id', user.id).maybeSingle(),
    supabase.from('product_builds').select('version, manifest').eq('owner_id', user.id).eq('product_id', product.id).order('version', { ascending: false }).limit(1),
  ])
  if (filesError || assetsError || templateError || profileError || buildsError) {
    const error = filesError ?? assetsError ?? templateError ?? profileError ?? buildsError
    return NextResponse.json({ error: error?.message ?? 'Could not load product data' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({})) as { notes?: string }
  const trimmedNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) : ''
  const mascotFiles = (files ?? []).map((file) => ({ id: file.id, filename: file.filename, origName: file.original_name, folder: file.folder, variant: file.variant }))
  const fixedFiles = (fixedAssetFiles ?? []).map((file) => ({ id: file.id, assetKey: file.asset_key, filename: file.filename, origName: file.original_name }))
  const configForValidation: ProductConfig = {
    name: product.name,
    sku: product.sku,
    productName: product.product_name,
    etsyTitle: product.etsy_title,
    description: product.description,
    notes: product.notes,
    contact: product.contact,
    price: Number(product.price),
    currency: product.currency,
    licenseType: product.license_type as 'personal' | 'commercial' | 'both',
    commercialPrice: product.commercial_price == null ? undefined : Number(product.commercial_price),
    folders: product.folders,
    mascotFiles,
    fixedAssetFiles: fixedFiles,
    etsyTags: product.etsy_tags,
    templateId: product.template_id,
    latestBuild: null,
    complete: product.complete,
    createdAt: product.created_at,
  }

  const templateRules = (template?.rules as unknown as TemplateRule[] | undefined) ?? []
  const validation = template ? validateProduct(configForValidation, templateRules) : null
  const requiredFailures = (validation ?? []).filter((entry) => entry.required && entry.status === 'missing')
  if (requiredFailures.length > 0) {
    return NextResponse.json({
      error: 'Product is not ready to package.',
      code: 'BUILD_REQUIREMENTS_BLOCKED',
      blocking: requiredFailures.map((entry) => ({ id: entry.ruleId, label: entry.label, detail: entry.detail ?? 'Required template requirement is missing.' })),
    }, { status: 422 })
  }
  const folderCounts = product.folders.map((label) => ({ label, count: mascotFiles.filter((file) => file.folder === label).length }))
  const readmeText = buildReadmeText(resolveTemplateData({
    productName: product.product_name,
    etsyTitle: product.etsy_title,
    contact: product.contact,
    description: product.description,
    notes: product.notes,
    licenseType: product.license_type as 'personal' | 'commercial' | 'both',
    price: Number(product.price),
    commercialPrice: product.commercial_price == null ? undefined : Number(product.commercial_price),
    currency: product.currency,
    folders: folderCounts,
    etsyTags: product.etsy_tags,
  }, {
    name: profile?.display_name ?? null,
    shopName: profile?.shop_name ?? null,
    shopContact: profile?.shop_contact ?? null,
    shopDescription: profile?.shop_description ?? null,
    readmeFooter: profile?.readme_footer ?? null,
  }, { defaultShopDescription: CONFIG.defaultShopDescription, defaultReadmeFooter: CONFIG.defaultReadmeFooter }))

  const version = product.build_version + 1
  const { buffer, manifest } = await buildZipBuffer({
    productId: product.id,
    displayProductName: product.product_name || product.name,
    mascotFiles: mascotFiles.map(({ id: _id, ...file }) => file),
    fixedAssetFiles: fixedFiles.map(({ id: _id, ...file }) => file),
    readmeText,
    version,
    template: template ? { id: template.id, name: template.name } : null,
    validation,
    downloadFile: async (relativePath) => {
      const { data: object } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(productStoragePath(user.id, product.id, relativePath))
      return object ? Buffer.from(await object.arrayBuffer()) : null
    },
  })

  const previousManifest = (builds?.[0]?.manifest as unknown as BuildManifest) ?? null
  const changelog = trimmedNotes || generateChangelog(manifest, previousManifest)
  const filename = `v${version}.zip`
  const storagePath = productStoragePath(user.id, product.id, filename)
  const { error: uploadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).upload(storagePath, buffer, { contentType: 'application/zip', upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: buildError } = await supabase.from('product_builds').insert({ owner_id: user.id, product_id: product.id, version, filename, file_size: buffer.byteLength, manifest: JSON.parse(JSON.stringify(manifest)), changelog, storage_path: storagePath })
  if (buildError) return NextResponse.json({ error: buildError.message }, { status: 500 })
  const { error: updateError } = await supabase.from('products').update({ build_version: version }).eq('owner_id', user.id).eq('id', product.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ version, manifest, warnings: manifest.warnings, hasRequiredFailures: false, changelog })
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await params
  const { data: product, error: productError } = await supabase.from('products').select('id').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  const { data: builds, error: buildsError } = await supabase.from('product_builds').select('version, file_size, changelog, reverted_from, created_at').eq('owner_id', user.id).eq('product_id', product.id).order('version', { ascending: false })
  if (buildsError) return NextResponse.json({ error: buildsError.message }, { status: 500 })
  return NextResponse.json((builds ?? []).map((build) => ({ version: build.version, fileSize: build.file_size, changelog: build.changelog, revertedFrom: build.reverted_from, createdAt: build.created_at })))
}
