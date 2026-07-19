import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { productKey, putObject } from '@/lib/object-storage'
import { MAX_PRODUCT_FILE_BYTES } from '@/lib/utils'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({ where: { userId_name: { userId, name: productName } } })
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

    await putObject(productKey(product.id, 'fixed-assets', filename), buffer, contentTypeFor(filename))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }
}
