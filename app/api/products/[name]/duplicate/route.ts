import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR, sanitizeName } from '@/lib/api-files'
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

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const sourceName = decodeURIComponent(name)
  const { newName } = (await request.json()) as { newName: string }
  const sanitizedNew = sanitizeName(newName ?? '')
  if (!sanitizedNew) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })

  const source = await prisma.product.findUnique({
    where: { userId_name: { userId, name: sourceName } },
    include: { files: true, fixedAssetFiles: true },
  })
  if (!source) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const srcDir = path.join(PRODUCTS_DIR, userId, sourceName)
  const destDir = path.join(PRODUCTS_DIR, userId, sanitizedNew)
  if (fs.existsSync(srcDir)) fs.cpSync(srcDir, destDir, { recursive: true })

  const duplicate = await prisma.product.create({
    data: {
      userId,
      name: sanitizedNew,
      sku: source.sku,
      productName: source.productName,
      etsyTitle: source.etsyTitle,
      description: source.description,
      notes: source.notes,
      contact: source.contact,
      price: source.price,
      currency: source.currency,
      licenseType: source.licenseType,
      commercialPrice: source.commercialPrice,
      folders: source.folders,
      etsyTags: source.etsyTags,
      templateId: source.templateId,
      complete: false,
      files: {
        create: source.files.map((f) => ({
          filename: f.filename,
          origName: f.origName,
          folder: f.folder,
          variant: f.variant,
        })),
      },
      fixedAssetFiles: {
        create: source.fixedAssetFiles.map((f) => ({
          assetKey: f.assetKey,
          filename: f.filename,
          origName: f.origName,
        })),
      },
    },
    include: { files: true, fixedAssetFiles: true },
  })

  return NextResponse.json(toConfig(duplicate))
}
