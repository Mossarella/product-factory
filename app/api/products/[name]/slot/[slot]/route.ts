import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentTypeFor } from '@/lib/api-files'
import { PRODUCT_FILES_BUCKET, productStoragePath } from '@/lib/supabase/storage'
import { MAX_PRODUCT_FILE_BYTES } from '@/lib/utils'

interface RouteContext {
  params: Promise<{ name: string; slot: string }>
}

const ALLOWED_SLOTS = [
  'etsy-hero', 'etsy-expressions', 'etsy-files',
  'etsy-preview', 'etsy-detail', 'etsy-branding',
]

async function getProduct(supabase: Awaited<ReturnType<typeof createClient>>, ownerId: string, productName: string) {
  return supabase.from('products').select('id').eq('owner_id', ownerId).eq('name', productName).maybeSingle()
}

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, slot } = await params
  const productName = decodeURIComponent(name)
  const decodedSlot = decodeURIComponent(slot)
  if (!ALLOWED_SLOTS.includes(decodedSlot)) return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })

  const { data: product, error: productError } = await getProduct(supabase, user.id, productName)
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const storagePath = productStoragePath(user.id, product.id, 'etsy-slots', decodedSlot)
  const { data: object, error: downloadError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).download(storagePath)
  if (downloadError || !object) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  return new NextResponse(await object.arrayBuffer(), { headers: { 'Content-Type': object.type || 'application/octet-stream' } })
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, slot } = await params
  const productName = decodeURIComponent(name)
  const decodedSlot = decodeURIComponent(slot)
  if (!ALLOWED_SLOTS.includes(decodedSlot)) return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })

  const { data: product, error: productError } = await getProduct(supabase, user.id, productName)
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_PRODUCT_FILE_BYTES) return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })

  try {
    const originalFilename = request.headers.get('x-filename') ?? 'file'
    const buffer = Buffer.from(await request.arrayBuffer())
    if (buffer.byteLength > MAX_PRODUCT_FILE_BYTES) return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
    const storagePath = productStoragePath(user.id, product.id, 'etsy-slots', decodedSlot)
    const { error: uploadError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).upload(storagePath, buffer, { contentType: contentTypeFor(originalFilename), upsert: true })
    if (uploadError) throw uploadError
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid slot path' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, slot } = await params
  const productName = decodeURIComponent(name)
  const decodedSlot = decodeURIComponent(slot)
  if (!ALLOWED_SLOTS.includes(decodedSlot)) return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })

  const { data: product, error: productError } = await getProduct(supabase, user.id, productName)
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const storagePath = productStoragePath(user.id, product.id, 'etsy-slots', decodedSlot)
  const { error: removeError } = await supabase.storage.from(PRODUCT_FILES_BUCKET).remove([storagePath])
  if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
