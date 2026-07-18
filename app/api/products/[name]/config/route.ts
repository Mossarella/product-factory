import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import type { Product, MascotFile, FixedAssetFile } from '@prisma/client'

interface RouteContext {
  params: Promise<{ name: string }>
}

type ProductWithFiles = Product & { files: MascotFile[]; fixedAssetFiles: FixedAssetFile[] }

function toConfig(p: ProductWithFiles) {
  return {
    name: p.name,
    sku: p.sku,
    productName: p.productName,
    etsyTitle: p.etsyTitle,
    description: p.description,
    notes: p.notes,
    contact: p.contact,
    price: p.price,
    currency: p.currency,
    licenseType: p.licenseType,
    commercialPrice: p.commercialPrice ?? undefined,
    folders: p.folders,
    mascotFiles: p.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      origName: f.origName,
      folder: f.folder,
      variant: f.variant,
    })),
    fixedAssetFiles: p.fixedAssetFiles.map((f) => ({
      id: f.id,
      assetKey: f.assetKey,
      filename: f.filename,
      origName: f.origName,
    })),
    etsyTags: p.etsyTags,
    templateId: p.templateId ?? null,
    complete: p.complete,
    createdAt: p.createdAt.toISOString(),
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId: session.user.id, name: productName } },
    include: { files: true, fixedAssetFiles: true },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  return NextResponse.json(toConfig(product))
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const mascotFiles = (body.mascotFiles as Array<{
    id?: string
    filename: string
    origName: string
    folder: string
    variant: string
  }>) ?? []

  const fixedAssetFiles = (body.fixedAssetFiles as Array<{
    id?: string
    assetKey: string
    filename: string
    origName: string
  }>) ?? []

  const product = await prisma.product.upsert({
    where: { userId_name: { userId, name: productName } },
    update: {
      sku: (body.sku as string) ?? '',
      productName: (body.productName as string) ?? productName,
      etsyTitle: (body.etsyTitle as string) ?? '',
      description: (body.description as string) ?? '',
      notes: (body.notes as string) ?? '',
      contact: (body.contact as string) ?? '',
      price: (body.price as number) ?? 0,
      currency: (body.currency as string) ?? 'USD',
      licenseType: (body.licenseType as string) ?? 'personal',
      commercialPrice: (body.commercialPrice as number | null | undefined) ?? null,
      folders: (body.folders as string[]) ?? ['Main'],
      etsyTags: (body.etsyTags as string[]) ?? [],
      templateId: (body.templateId as string | null | undefined) ?? null,
      complete: (body.complete as boolean) ?? false,
    },
    create: {
      userId,
      name: productName,
      sku: (body.sku as string) ?? '',
      productName: (body.productName as string) ?? productName,
      etsyTitle: (body.etsyTitle as string) ?? '',
      description: (body.description as string) ?? '',
      notes: (body.notes as string) ?? '',
      contact: (body.contact as string) ?? '',
      price: (body.price as number) ?? 0,
      currency: (body.currency as string) ?? 'USD',
      licenseType: (body.licenseType as string) ?? 'personal',
      commercialPrice: (body.commercialPrice as number | null | undefined) ?? null,
      folders: (body.folders as string[]) ?? ['Main'],
      etsyTags: (body.etsyTags as string[]) ?? [],
      templateId: (body.templateId as string | null | undefined) ?? null,
      complete: (body.complete as boolean) ?? false,
    },
    include: { files: true, fixedAssetFiles: true },
  })

  // Replace mascot files
  await prisma.mascotFile.deleteMany({ where: { productId: product.id } })
  if (mascotFiles.length > 0) {
    await prisma.mascotFile.createMany({
      data: mascotFiles.map((f) => ({
        ...(f.id ? { id: f.id } : {}),
        productId: product.id,
        filename: f.filename,
        origName: f.origName,
        folder: f.folder,
        variant: f.variant,
      })),
    })
  }

  // Replace fixed asset files
  await prisma.fixedAssetFile.deleteMany({ where: { productId: product.id } })
  if (fixedAssetFiles.length > 0) {
    await prisma.fixedAssetFile.createMany({
      data: fixedAssetFiles.map((f) => ({
        ...(f.id ? { id: f.id } : {}),
        productId: product.id,
        assetKey: f.assetKey,
        filename: f.filename,
        origName: f.origName,
      })),
    })
  }

  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    include: { files: true, fixedAssetFiles: true },
  })

  return NextResponse.json(toConfig(updated!))
}
