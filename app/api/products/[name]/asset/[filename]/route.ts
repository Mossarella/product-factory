import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentTypeFor, sanitizeFilename } from '@/lib/api-files'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'

interface RouteContext {
  params: Promise<{ name: string; filename: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, filename } = await params
  const safeFilename = sanitizeFilename(decodeURIComponent(filename))
  const { data: product, error: productError } = await supabase.from('products').select('id').eq('owner_id', user.id).eq('name', decodeURIComponent(name)).maybeSingle()
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const storagePath = productStoragePath(user.id, product.id, 'fixed-assets', safeFilename)
  const { data: object, error: downloadError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(storagePath)
  if (downloadError || !object) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  return new NextResponse(await object.arrayBuffer(), { headers: { 'Content-Type': object.type || contentTypeFor(safeFilename) } })
}
