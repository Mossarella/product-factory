import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import { MAX_PRODUCT_FILE_BYTES } from '@/lib/utils'
import { assertStorageCapacity, entitlementErrorResponse, getEntitlement } from '@/lib/entitlements'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await params
  const { data: product, error: productError } = await supabase.from('products').select('id').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  try {
    const entitlement = await getEntitlement(supabase)
    if (contentLength > 0) assertStorageCapacity(entitlement, contentLength)
  } catch (error) {
    const response = entitlementErrorResponse(error)
    if (response) return response
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check storage quota' }, { status: 500 })
  }
  if (contentLength > MAX_PRODUCT_FILE_BYTES) return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
  try {
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'file')
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_PRODUCT_FILE_BYTES) return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
    try {
      const entitlement = await getEntitlement(supabase)
      assertStorageCapacity(entitlement, buffer.byteLength)
    } catch (error) {
      const response = entitlementErrorResponse(error)
      if (response) return response
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check storage quota' }, { status: 500 })
    }
    const storagePath = productStoragePath(user.id, product.id, 'fixed-assets', filename)
    const { error: uploadError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).upload(storagePath, buffer, { contentType: contentTypeFor(filename), upsert: true })
    if (uploadError) throw uploadError
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }
}
