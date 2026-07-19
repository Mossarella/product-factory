import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { deleteObjectsByPrefix, productKey } from '@/lib/object-storage'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  await deleteObjectsByPrefix(productKey(product.id) + '/')
  await prisma.product.delete({ where: { id: product.id } })

  return NextResponse.json({ ok: true })
}
