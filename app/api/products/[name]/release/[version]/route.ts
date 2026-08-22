import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_BUILDS_BUCKET } from '@/lib/release-storage'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, version: versionParam } = await params
  const version = Number(versionParam)
  if (!Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const { data: product, error: productError } = await supabase.from('products').select('id').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const { data: release, error: releaseError } = await supabase.from('product_releases').select('bundle_filename, bundle_size, bundle_sha256, bundle_storage_path').eq('owner_id', user.id).eq('product_id', product.id).eq('version', version).maybeSingle()
  if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 })
  if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 })

  const { data: object, error: downloadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).download(release.bundle_storage_path)
  if (downloadError || !object) return NextResponse.json({ error: 'Release bundle not found' }, { status: 404 })
  return new NextResponse(await object.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(release.bundle_size),
      'Content-Disposition': `attachment; filename="${release.bundle_filename.replace(/[^\w. -]/g, '')}"`,
      'X-Release-SHA256': release.bundle_sha256,
    },
  })
}
