# Spec: API routes rewrite for multi-user (DB + session scoping)

## Context
- Auth.js v5 — get session via `import { auth } from '@/auth'`
- session.user.id = userId (string, Prisma cuid)
- Prisma client at `import { prisma } from '@/lib/db'`
- File storage still on FS, namespaced by userId
- productPath function updated to: `userProductPath(userId, name, ...segments)`
- API responses must match existing ProductConfig / ProductSummary TypeScript shapes

## Helper: toConfig()

Used by multiple routes to map Prisma Product → ProductConfig shape:

```ts
import type { Product, MascotFile } from '@prisma/client'

type ProductWithFiles = Product & { files: MascotFile[] }

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
    etsyTags: p.etsyTags,
    complete: p.complete,
    createdAt: p.createdAt.toISOString(),
  }
}
```

---

## File 1: app/api/products/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/route.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR, sanitizeName } from '@/lib/api-files'
import { ROOT } from '@/lib/api-files'

function readLicense(): { plan: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'license.json'), 'utf8'))
  } catch {
    return { plan: 'free' }
  }
}

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
  if (readLicense().plan === 'free' && productCount >= 3) {
    return NextResponse.json({ error: 'Free plan limit reached' }, { status: 403 })
  }

  const existing = await prisma.product.findUnique({ where: { userId_name: { userId, name: sanitizedName } } })
  if (existing) return NextResponse.json({ error: 'Product already exists' }, { status: 409 })

  // Create FS directories
  const productDir = path.join(PRODUCTS_DIR, userId, sanitizedName)
  for (const sub of ['mascot-files', 'etsy-files', 'veado-file',
    'assets/etsy-hero', 'assets/etsy-expressions', 'assets/etsy-files',
    'assets/etsy-preview', 'assets/etsy-detail', 'assets/etsy-branding']) {
    fs.mkdirSync(path.join(productDir, sub), { recursive: true })
  }

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
```

---

## File 2: app/api/products/[name]/config/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/config/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { sanitizeName } from '@/lib/api-files'
import type { Product, MascotFile } from '@prisma/client'

interface RouteContext {
  params: Promise<{ name: string }>
}

type ProductWithFiles = Product & { files: MascotFile[] }

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
    etsyTags: p.etsyTags,
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
    include: { files: true },
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
    id?: string; filename: string; origName: string; folder: string; variant: string
  }>) ?? []

  // Upsert product
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
      complete: (body.complete as boolean) ?? false,
    },
    include: { files: true },
  })

  // Replace files: delete existing, create new
  await prisma.mascotFile.deleteMany({ where: { productId: product.id } })
  if (mascotFiles.length > 0) {
    await prisma.mascotFile.createMany({
      data: mascotFiles.map((f) => ({
        id: f.id,
        productId: product.id,
        filename: f.filename,
        origName: f.origName,
        folder: f.folder,
        variant: f.variant,
      })),
    })
  }

  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    include: { files: true },
  })

  return NextResponse.json(toConfig(updated!))
}
```

---

## File 3: lib/api-files.ts (updated)

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/lib/api-files.ts` with this version that adds `userProductPath`:

```ts
import fs from 'fs'
import path from 'path'

export const ROOT = process.cwd()
export const PRODUCTS_DIR = path.join(ROOT, 'products')
export const ASSETS_DIR = path.join(ROOT, 'assets')

export const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.veado': 'application/octet-stream',
  '.zip': 'application/zip',
}

export function resolveWithinRoot(...segments: string[]): string {
  return resolveWithin(ROOT, ...segments)
}

export function resolveWithin(directory: string, ...segments: string[]): string {
  const resolved = path.resolve(directory, ...segments)
  if (resolved !== directory && !resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error('Invalid path')
  }
  return resolved
}

export function productPath(name: string, ...segments: string[]): string {
  return resolveWithin(PRODUCTS_DIR, name, ...segments)
}

export function userProductPath(userId: string, name: string, ...segments: string[]): string {
  return resolveWithin(PRODUCTS_DIR, userId, name, ...segments)
}

export function assetPath(name: string, ...segments: string[]): string {
  return resolveWithin(ASSETS_DIR, name, ...segments)
}

export function decodeSegment(segment: string): string {
  return decodeURIComponent(segment)
}

export function sanitizeName(name: string): string {
  return name.trim().replace(/[^\w\- ]/g, '')
}

export function sanitizeFilename(filename: string): string {
  return path.basename(filename).replace(/[^\w\-. ]/g, '_')
}

export function contentTypeFor(filename: string): string {
  return MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

export function clearDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true })
  for (const entry of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, entry), { recursive: true, force: true })
  }
}

export function firstFile(directory: string): string | undefined {
  if (!fs.existsSync(directory)) return undefined
  return fs.readdirSync(directory).find((entry) =>
    fs.statSync(path.join(directory, entry)).isFile(),
  )
}

export function readBodyBuffer(request: Request): Promise<Buffer> {
  return request.arrayBuffer().then((arrayBuffer) => Buffer.from(arrayBuffer))
}
```

---

## Verification
- All 3 files created/replaced
- Print: === COMPLETE: auth api routes ===
