import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { sanitizeName } from '@/lib/api-files'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const products = await prisma.product.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: { name: true, complete: true, createdAt: true },
  })

  return NextResponse.json(
    products.map((p) => ({
      name: p.name,
      complete: p.complete,
      createdAt: p.createdAt.toISOString(),
    })),
  )
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { name } = (await request.json()) as { name: string }
  const sanitizedName = sanitizeName(name ?? '')
  if (!sanitizedName) {
    return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
  }

  const productCount = await prisma.product.count({ where: { userId } })
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
  if ((user?.plan ?? 'free') === 'free' && productCount >= 3) {
    return NextResponse.json({ error: 'Free plan limit reached' }, { status: 403 })
  }

  const existing = await prisma.product.findUnique({
    where: { userId_name: { userId, name: sanitizedName } },
  })
  if (existing) return NextResponse.json({ error: 'Product already exists' }, { status: 409 })

  const product = await prisma.product.create({
    data: {
      userId,
      name: sanitizedName,
      sku: '',
      productName: sanitizedName,
      etsyTitle: '',
      description: '',
      notes: '',
      contact: '',
      price: 0,
      currency: 'USD',
      licenseType: 'personal',
      folders: ['Main'],
      etsyTags: [],
      complete: false,
    },
    include: { files: true },
  })

  return NextResponse.json(
    {
      name: product.name,
      sku: product.sku,
      productName: product.productName,
      etsyTitle: product.etsyTitle,
      description: product.description,
      notes: product.notes,
      contact: product.contact,
      price: product.price,
      currency: product.currency,
      licenseType: product.licenseType,
      commercialPrice: product.commercialPrice ?? undefined,
      folders: product.folders,
      mascotFiles: [],
      etsyTags: product.etsyTags,
      complete: product.complete,
      createdAt: product.createdAt.toISOString(),
    },
    { status: 201 },
  )
}
