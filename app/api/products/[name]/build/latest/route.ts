import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { builds: { orderBy: { version: 'desc' }, take: 1 } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const latestBuild = product.builds[0]
  if (!latestBuild) return NextResponse.json({ error: 'No build found' }, { status: 404 })

  try {
    const filePath = userProductPath(userId, product.name, 'builds', latestBuild.filename)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
    }
    const downloadName = `${(product.productName || product.name).replace(/[^\w\- ]/g, '')}Pack.zip`
    return new NextResponse(fs.readFileSync(filePath), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
  }
}
