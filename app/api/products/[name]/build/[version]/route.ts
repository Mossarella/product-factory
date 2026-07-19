import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getObject, productKey } from '@/lib/object-storage'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, version } = await params
  const productName = decodeURIComponent(name)
  const versionNumber = Number(version)
  if (!Number.isInteger(versionNumber)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { builds: { where: { version: versionNumber }, take: 1 } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const build = product.builds[0]
  if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

  const object = await getObject(productKey(product.id, 'builds', build.filename))
  if (!object) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })

  const downloadName = `${(product.productName || product.name).replace(/[^\w\- ]/g, '')}Pack-v${build.version}.zip`
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
    },
  })
}
