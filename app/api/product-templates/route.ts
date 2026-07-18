import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.productTemplate.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, assets: true, rules: true },
  })
  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, assets, rules } = (await request.json()) as { name: string; assets: string[]; rules?: unknown[] }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const template = await prisma.productTemplate.create({
    data: { userId: session.user.id, name: name.trim(), assets: assets ?? [], rules: (rules ?? []) as Prisma.InputJsonValue },
    select: { id: true, name: true, assets: true, rules: true },
  })
  return NextResponse.json(template, { status: 201 })
}
