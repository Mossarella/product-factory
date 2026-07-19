import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { contentTypeFor, readBodyBuffer, sanitizeFilename } from '@/lib/api-files'
import { getObject, productKey, putObject } from '@/lib/object-storage'
import { MAX_PRODUCT_FILE_BYTES } from '@/lib/utils'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({ where: { userId_name: { userId, name: productName } } })
  if (!product) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const object = await getObject(productKey(product.id, 'veado-file'))
  if (!object) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const filename = object.metadata?.filename ?? 'scene.veado'
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      'Content-Type': object.contentType || contentTypeFor(filename),
      'X-Filename': filename,
    },
  })
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
    const filename = sanitizeFilename(request.headers.get('x-filename') ?? 'scene.veado')
    const buffer = await readBodyBuffer(request)
    if (buffer.byteLength > MAX_PRODUCT_FILE_BYTES) {
      return NextResponse.json({ error: 'File must be 50MB or smaller' }, { status: 413 })
    }
    await putObject(productKey(product.id, 'veado-file'), buffer, contentTypeFor(filename), { filename })
    return NextResponse.json({ filename })
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
  }
}
