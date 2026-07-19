import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { CONFIG } from '@/config'
import { productKey, putObject } from '@/lib/object-storage'
import { buildZipBuffer } from '@/lib/zip-server'
import { generateChangelog } from '@/lib/build-changelog'
import { resolveTemplateData } from '@/lib/templates'
import { buildReadmeText } from '@/lib/templates-server'
import { validateProduct } from '@/lib/template-rules'
import type { TemplateRule } from '@/lib/template-rules'
import type { BuildManifest } from '@/lib/zip-server'
import type { ProductConfig } from '@/lib/types'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: {
      files: true,
      fixedAssetFiles: true,
      template: true,
      user: { select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true } },
      builds: { orderBy: { version: 'desc' }, take: 1 },
    },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { notes?: string }
  const trimmedNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) : ''

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

  const readmeText = buildReadmeText(resolveTemplateData(
    {
      productName: product.productName,
      etsyTitle: product.etsyTitle,
      contact: product.contact,
      description: product.description,
      notes: product.notes,
      licenseType: product.licenseType as 'personal' | 'commercial' | 'both',
      price: product.price,
      commercialPrice: product.commercialPrice ?? undefined,
      currency: product.currency,
      folders: folderCounts,
      etsyTags: product.etsyTags,
    },
    product.user,
    { defaultShopDescription: CONFIG.defaultShopDescription, defaultReadmeFooter: CONFIG.defaultReadmeFooter },
  ))

  const version = product.buildVersion + 1

  const { buffer, manifest } = await buildZipBuffer({
    productId: product.id,
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

  const previousManifest = (product.builds[0]?.manifest as unknown as BuildManifest) ?? null
  const changelog = trimmedNotes || generateChangelog(manifest, previousManifest)

  const filename = `v${version}.zip`
  await putObject(productKey(product.id, 'builds', filename), buffer, 'application/zip')

  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { buildVersion: version } }),
    prisma.productBuild.create({
      data: {
        productId: product.id,
        version,
        filename,
        fileSize: buffer.byteLength,
        manifest: manifest as unknown as object,
        changelog,
      },
    }),
  ])

  const hasRequiredFailures = (validation ?? []).some((v) => v.required && v.status === 'missing')

  return NextResponse.json({ version, manifest, warnings: manifest.warnings, hasRequiredFailures, changelog })
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { builds: { orderBy: { version: 'desc' } } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  return NextResponse.json(product.builds.map((b) => ({
    version: b.version,
    fileSize: b.fileSize,
    changelog: b.changelog,
    revertedFrom: b.revertedFrom,
    createdAt: b.createdAt.toISOString(),
  })))
}
