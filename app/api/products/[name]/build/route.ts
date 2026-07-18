import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { CONFIG } from '@/config'
import { userProductPath } from '@/lib/api-files'
import { buildZipBuffer } from '@/lib/zip-server'
import { buildReadmeText } from '@/lib/templates-server'
import { validateProduct } from '@/lib/template-rules'
import type { TemplateRule } from '@/lib/template-rules'
import type { ProductConfig } from '@/lib/types'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { files: true, fixedAssetFiles: true, template: true },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const configForValidation: ProductConfig = {
    name: product.name,
    sku: product.sku,
    productName: product.productName,
    etsyTitle: product.etsyTitle,
    description: product.description,
    notes: product.notes,
    contact: product.contact,
    price: product.price,
    currency: product.currency,
    licenseType: product.licenseType as 'personal' | 'commercial' | 'both',
    commercialPrice: product.commercialPrice ?? undefined,
    folders: product.folders,
    mascotFiles: product.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      origName: f.origName,
      folder: f.folder,
      variant: f.variant,
    })),
    fixedAssetFiles: product.fixedAssetFiles.map((f) => ({
      id: f.id,
      assetKey: f.assetKey,
      filename: f.filename,
      origName: f.origName,
    })),
    etsyTags: product.etsyTags,
    templateId: product.templateId,
    latestBuild: null,
    complete: product.complete,
    createdAt: product.createdAt.toISOString(),
  }

  const templateRules = (product.template?.rules as unknown as TemplateRule[] | undefined) ?? []
  const validation = product.template ? validateProduct(configForValidation, templateRules) : null

  const folderCounts = product.folders.map((label) => ({
    label,
    count: product.files.filter((f) => f.folder === label).length,
  }))

  const readmeText = buildReadmeText({
    name: product.productName,
    etsyName: product.etsyTitle,
    shopName: CONFIG.shopName,
    contact: product.contact || CONFIG.contact,
    description: product.description || CONFIG.description,
    notes: product.notes || CONFIG.readmeFooter,
    licenseType: product.licenseType as 'personal' | 'commercial' | 'both',
    price: product.price,
    commercialPrice: product.commercialPrice ?? undefined,
    currency: product.currency,
    folders: folderCounts,
    etsyTags: product.etsyTags,
  })

  const version = product.buildVersion + 1

  const { buffer, manifest } = await buildZipBuffer({
    userId,
    storageProductName: product.name,
    displayProductName: product.productName || product.name,
    mascotFiles: product.files.map((f) => ({
      filename: f.filename,
      origName: f.origName,
      folder: f.folder,
      variant: f.variant,
    })),
    fixedAssetFiles: product.fixedAssetFiles.map((f) => ({
      assetKey: f.assetKey,
      filename: f.filename,
      origName: f.origName,
    })),
    readmeText,
    version,
    template: product.template ? { id: product.template.id, name: product.template.name } : null,
    validation,
  })

  const filename = `v${version}.zip`
  const directory = userProductPath(userId, product.name, 'builds')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, filename), buffer)

  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { buildVersion: version } }),
    prisma.productBuild.create({
      data: {
        productId: product.id,
        version,
        filename,
        fileSize: buffer.byteLength,
        manifest: manifest as unknown as object,
      },
    }),
  ])

  const hasRequiredFailures = (validation ?? []).some((v) => v.required && v.status === 'missing')

  return NextResponse.json({ version, manifest, warnings: manifest.warnings, hasRequiredFailures })
}
