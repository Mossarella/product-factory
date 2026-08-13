import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_BUILDS_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import { rebuildManifestForRevert } from '@/lib/zip-server'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function POST(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, version } = await params
  const targetVersion = Number(version)
  if (!Number.isInteger(targetVersion)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const { data: product, error: productError } = await supabase.from('products').select('id, build_version').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  const { data: targetBuild, error: buildError } = await supabase.from('product_builds').select('version, filename, storage_path').eq('owner_id', user.id).eq('product_id', product.id).eq('version', targetVersion).maybeSingle()
  if (buildError) return NextResponse.json({ error: buildError.message }, { status: 500 })
  if (!targetBuild) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

  const sourcePath = targetBuild.storage_path ?? productStoragePath(user.id, product.id, targetBuild.filename)
  const { data: sourceObject, error: downloadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).download(sourcePath)
  if (downloadError || !sourceObject) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
  const newVersion = product.build_version + 1
  const { buffer, manifest } = await rebuildManifestForRevert(Buffer.from(await sourceObject.arrayBuffer()), { version: newVersion, builtAt: new Date().toISOString() })
  const filename = `v${newVersion}.zip`
  const storagePath = productStoragePath(user.id, product.id, filename)
  const { error: uploadError } = await supabase.storage.from(PRODUCT_BUILDS_BUCKET).upload(storagePath, buffer, { contentType: 'application/zip', upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const changelog = `Reverted to v${targetVersion}`
  const { error: insertError } = await supabase.from('product_builds').insert({ owner_id: user.id, product_id: product.id, version: newVersion, filename, file_size: buffer.byteLength, manifest: JSON.parse(JSON.stringify(manifest)), changelog, reverted_from: targetVersion, storage_path: storagePath })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  const { error: updateError } = await supabase.from('products').update({ build_version: newVersion }).eq('owner_id', user.id).eq('id', product.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ version: newVersion, revertedFrom: targetVersion, changelog })
}
