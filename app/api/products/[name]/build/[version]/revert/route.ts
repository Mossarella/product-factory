import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getObject, productKey, putObject } from '@/lib/object-storage'
import { rebuildManifestForRevert } from '@/lib/zip-server'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, version } = await params
  const productName = decodeURIComponent(name)
  const targetVersion = Number(version)
  if (!Number.isInteger(targetVersion)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { builds: { where: { version: targetVersion }, take: 1 } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const targetBuild = product.builds[0]
  if (!targetBuild) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

  const sourceObject = await getObject(productKey(product.id, 'builds', targetBuild.filename))
  if (!sourceObject) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })

  const newVersion = product.buildVersion + 1
  const builtAt = new Date().toISOString()
  const { buffer, manifest } = await rebuildManifestForRevert(sourceObject.body, {
    version: newVersion,
    builtAt,
  })

  const filename = `v${newVersion}.zip`
  await putObject(productKey(product.id, 'builds', filename), buffer, 'application/zip')

  const changelog = `Reverted to v${targetVersion}`

  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { buildVersion: newVersion } }),
    prisma.productBuild.create({
      data: {
        productId: product.id,
        version: newVersion,
        filename,
        fileSize: buffer.byteLength,
        manifest: manifest as unknown as object,
        changelog,
        revertedFrom: targetVersion,
      },
    }),
  ])

  return NextResponse.json({ version: newVersion, revertedFrom: targetVersion, changelog })
}
