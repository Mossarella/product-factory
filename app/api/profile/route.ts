import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true },
  })
  return NextResponse.json(user)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    name?: string
    shopName?: string
    shopContact?: string
    shopDescription?: string
    readmeFooter?: string
  }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      shopName: body.shopName?.trim() || null,
      shopContact: body.shopContact?.trim() || null,
      shopDescription: body.shopDescription?.trim() || null,
      readmeFooter: body.readmeFooter?.trim() || null,
    },
    select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true },
  })
  return NextResponse.json(updated)
}
