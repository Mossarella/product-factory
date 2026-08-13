import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { productStoragePath, PRODUCT_FILES_BUCKET } from '@/lib/supabase/storage'
import { MAX_PRODUCT_FILE_BYTES } from '@/lib/utils'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const productName = decodeURIComponent(name)
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('owner_id', user.id)
    .eq('name', productName)
    .maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_PRODUCT_FILE_BYTES) {
    return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
  }

  try {
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'file')
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_PRODUCT_FILE_BYTES) {
      return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
    }

    const storagePath = productStoragePath(user.id, product.id, 'mascot-files', filename)
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_FILES_BUCKET)
      .upload(storagePath, buffer, { contentType: contentTypeFor(filename), upsert: true })
    if (uploadError) throw uploadError

    const { error: metadataError } = await supabase
      .from('product_files')
      .upsert({
        owner_id: user.id,
        product_id: product.id,
        filename,
        original_name: request.headers.get('x-filename') ?? filename,
        folder: 'Main',
        variant: '',
        storage_path: storagePath,
      }, { onConflict: 'id' })
    if (metadataError) throw metadataError

    return NextResponse.json({ success: true, filename, storagePath })
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }
}
