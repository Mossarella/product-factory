import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
    select: { name: true },
  })
  return NextResponse.json(updated)
}
