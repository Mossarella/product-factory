import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR } from '@/lib/api-files'

function heroSlotEmpty(userId: string, productName: string): boolean {
  try {
    const heroDir = path.join(PRODUCTS_DIR, userId, productName, 'assets', 'etsy-hero')
    return fs.readdirSync(heroDir).filter((f: string) => !f.startsWith('.')).length === 0
  } catch {
    return true
  }
}

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
      files: { select: { id: true } },
    },
  })

  const total = products.length
  const readyToPublish = products.filter(p => p.complete).length
  const needsReview = products.filter(
    p => !p.complete && (p.files.length > 0 || p.etsyTitle !== '')
  ).length
  const missingHero = products.filter(p => heroSlotEmpty(userId, p.name)).length
  const needReadme = products.filter(
    p => !p.description || p.description.trim() === ''
  ).length

  return NextResponse.json({
    total,
    readyToPublish,
    needsReview,
    missingHero,
    needReadme,
    lastExport: null,
  })
}
