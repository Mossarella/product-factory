import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { heroSlotEmpty, computeStats } from '@/lib/dashboard-stats'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const products = await prisma.product.findMany({
    where: { userId },
    select: {
      name: true,
      complete: true,
      description: true,
      etsyTitle: true,
      etsyTags: true,
      createdAt: true,
      files: { select: { id: true, origName: true } },
    },
  })

  const stats = computeStats(products, userId)

  return NextResponse.json({
    ...stats,
    lastExport: null,
  })
}
