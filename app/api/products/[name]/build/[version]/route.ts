import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_BUILDS_BUCKET, productStoragePath } from '@/lib/supabase/storage'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, version } = await params
  const versionNumber = Number(version)
  if (!Number.isInteger(versionNumber)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const { data: product, error: productError } = await supabase.from('products').select('id, name, product_name').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  const { data: build, error: buildError } = await supabase.from('product_builds').select('version, filename, storage_path').eq('owner_id', user.id).eq('product_id', product.id).eq('version', versionNumber).maybeSingle()
  if (buildError) return NextResponse.json({ error: buildError.message }, { status: 500 })
  if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

  const storagePath = build.storage_path ?? productStoragePath(user.id, product.id, build.filename)
  const { data: object, error: downloadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).download(storagePath)
  if (downloadError || !object) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
  const downloadName = `${(product.product_name || product.name).replace(/[^\w\- ]/g, '')}Pack-v${build.version}.zip`
  return new NextResponse(await object.arrayBuffer(), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${downloadName}"` } })
}
