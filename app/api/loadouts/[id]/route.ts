import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const loadout = await prisma.loadout.findUnique({ where: { id }, select: { id: true, name: true, assets: true, userId: true } })
  if (!loadout || loadout.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ id: loadout.id, name: loadout.name, assets: loadout.assets })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.loadout.findUnique({ where: { id }, select: { userId: true } })
  if (!existing || existing.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json()) as { name?: string; assets?: string[] }
  const loadout = await prisma.loadout.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.assets !== undefined && { assets: body.assets }),
    },
    select: { id: true, name: true, assets: true },
  })
  return NextResponse.json(loadout)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.loadout.findUnique({ where: { id }, select: { userId: true } })
  if (!existing || existing.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.loadout.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
