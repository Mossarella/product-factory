import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { computeStats } from '@/lib/dashboard-stats'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const products = await prisma.product.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      complete: true,
      description: true,
      etsyTitle: true,
      etsyTags: true,
      createdAt: true,
      files: { select: { id: true, origName: true } },
    },
  })

  const stats = await computeStats(products)

  return NextResponse.json({
    ...stats,
    lastExport: null,
  })
}
