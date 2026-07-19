import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { contentTypeFor } from '@/lib/api-files'
import { deleteObject, getObject, productKey, putObject } from '@/lib/object-storage'

interface RouteContext {
  params: Promise<{ name: string; slot: string }>
}

const ALLOWED_SLOTS = [
  'etsy-hero', 'etsy-expressions', 'etsy-files',
  'etsy-preview', 'etsy-detail', 'etsy-branding',
]

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, slot } = await params
  const productName = decodeURIComponent(name)
  const decodedSlot = decodeURIComponent(slot)

  if (!ALLOWED_SLOTS.includes(decodedSlot)) {
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
  }

  const product = await prisma.product.findUnique({ where: { userId_name: { userId, name: productName } } })
  if (!product) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const object = await getObject(productKey(product.id, 'etsy-slots', decodedSlot))
  if (!object) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return new NextResponse(new Uint8Array(object.body), {
    headers: { 'Content-Type': object.contentType || 'application/octet-stream' },
  })
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, slot } = await params
  const productName = decodeURIComponent(name)
  const decodedSlot = decodeURIComponent(slot)

  if (!ALLOWED_SLOTS.includes(decodedSlot)) {
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
  }

  const product = await prisma.product.findUnique({ where: { userId_name: { userId, name: productName } } })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  try {
    const originalFilename = request.headers.get('x-filename') ?? 'file'
    const buffer = Buffer.from(await request.arrayBuffer())
    await putObject(productKey(product.id, 'etsy-slots', decodedSlot), buffer, contentTypeFor(originalFilename))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid slot path' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, slot } = await params
  const productName = decodeURIComponent(name)
  const decodedSlot = decodeURIComponent(slot)

  if (!ALLOWED_SLOTS.includes(decodedSlot)) {
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
  }

  const product = await prisma.product.findUnique({ where: { userId_name: { userId, name: productName } } })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  try {
    await deleteObject(productKey(product.id, 'etsy-slots', decodedSlot))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid slot path' }, { status: 400 })
  }
}
