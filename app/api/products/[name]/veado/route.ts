import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import { MAX_PRODUCT_FILE_BYTES } from '@/lib/utils'

interface RouteContext {
  params: Promise<{ name: string }>
}

async function getProduct(supabase: Awaited<ReturnType<typeof createClient>>, ownerId: string, productName: string) {
  return supabase.from('products').select('id').eq('owner_id', ownerId).eq('name', productName).maybeSingle()
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const productName = decodeURIComponent(name)
  const { data: product, error: productError } = await getProduct(supabase, user.id, productName)
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const { data: metadata } = await supabase
    .from('product_files')
    .select('filename, storage_path')
    .eq('owner_id', user.id)
    .eq('product_id', product.id)
    .eq('variant', 'veado')
    .maybeSingle()
  const filename = metadata?.filename ?? 'scene.veado'
  const storagePath = metadata?.storage_path ?? productStoragePath(user.id, product.id, 'veado-file')
  const { data: object, error: downloadError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(storagePath)
  if (downloadError || !object) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return new NextResponse(await object.arrayBuffer(), {
    headers: { 'Content-Type': object.type || contentTypeFor(filename), 'X-Filename': filename },
  })
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const productName = decodeURIComponent(name)
  const { data: product, error: productError } = await getProduct(supabase, user.id, productName)
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_PRODUCT_FILE_BYTES) return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })

  try {
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'scene.veado')
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_PRODUCT_FILE_BYTES) return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
    const storagePath = productStoragePath(user.id, product.id, 'veado-file')
    const { error: uploadError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).upload(storagePath, buffer, { contentType: contentTypeFor(filename), upsert: true })
    if (uploadError) throw uploadError

    const { error: metadataError } = await supabase.from('product_files').upsert({
      owner_id: user.id,
      product_id: product.id,
      filename,
      original_name: request.headers.get('x-filename') ?? filename,
      folder: 'Main',
      variant: 'veado',
      storage_path: storagePath,
    }, { onConflict: 'id' })
    if (metadataError) throw metadataError
    return NextResponse.json({ filename })
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }
}
