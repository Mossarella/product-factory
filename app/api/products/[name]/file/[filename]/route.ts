import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { contentTypeFor, sanitizeFilename } from '@/lib/api-files'
import { getObject, productKey } from '@/lib/object-storage'

interface RouteContext {
  params: Promise<{ name: string; filename: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, filename } = await params
  const productName = decodeURIComponent(name)
  const safeFilename = sanitizeFilename(decodeURIComponent(filename))

  const product = await prisma.product.findUnique({ where: { userId_name: { userId, name: productName } } })
  if (!product) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const object = await getObject(productKey(product.id, 'mascot-files', safeFilename))
  if (!object) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return new NextResponse(new Uint8Array(object.body), {
    headers: { 'Content-Type': object.contentType || contentTypeFor(safeFilename) },
  })
}
