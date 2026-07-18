import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const template = await prisma.productTemplate.findUnique({ where: { id }, select: { id: true, name: true, assets: true, rules: true, userId: true } })
  if (!template || template.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ id: template.id, name: template.name, assets: template.assets, rules: template.rules })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.productTemplate.findUnique({ where: { id }, select: { userId: true } })
  if (!existing || existing.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json()) as { name?: string; assets?: string[]; rules?: unknown[] }
  const template = await prisma.productTemplate.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.assets !== undefined && { assets: body.assets }),
      ...(body.rules !== undefined && { rules: body.rules as Prisma.InputJsonValue }),
    },
    select: { id: true, name: true, assets: true, rules: true },
  })
  return NextResponse.json(template)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.productTemplate.findUnique({ where: { id }, select: { userId: true } })
  if (!existing || existing.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.productTemplate.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
