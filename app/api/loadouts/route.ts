import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const loadouts = await prisma.loadout.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, assets: true },
  })
  return NextResponse.json(loadouts)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, assets } = (await request.json()) as { name: string; assets: string[] }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const loadout = await prisma.loadout.create({
    data: { userId: session.user.id, name: name.trim(), assets: assets ?? [] },
    select: { id: true, name: true, assets: true },
  })
  return NextResponse.json(loadout, { status: 201 })
}
