import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { userProductPath } from '@/lib/api-files'
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

  const sourcePath = userProductPath(userId, product.name, 'builds', targetBuild.filename)
  if (!fs.existsSync(sourcePath)) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })

  const newVersion = product.buildVersion + 1
  const builtAt = new Date().toISOString()
  const { buffer, manifest } = await rebuildManifestForRevert(fs.readFileSync(sourcePath), {
    version: newVersion,
    builtAt,
  })

  const filename = `v${newVersion}.zip`
  const directory = userProductPath(userId, product.name, 'builds')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, filename), buffer)

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
