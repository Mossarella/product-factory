# Spec: File + slot + rename + duplicate routes (updated for multi-user)

All routes get userId from `await auth()` and use `userProductPath(userId, name, ...)` for FS.

## File 1: app/api/products/[name]/file/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/file/route.ts`:

```ts
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { sanitizeFilename, userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  const rawFilename = request.headers.get('x-filename') ?? 'file'
  const filename = sanitizeFilename(rawFilename)

  try {
    const dir = userProductPath(userId, productName, 'mascot-files')
    fs.mkdirSync(dir, { recursive: true })
    const buffer = Buffer.from(await request.arrayBuffer())
    fs.writeFileSync(userProductPath(userId, productName, 'mascot-files', filename), buffer)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
}
```

---

## File 2: app/api/products/[name]/file/[filename]/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/file/[filename]/route.ts`:

```ts
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { contentTypeFor, sanitizeFilename, userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string; filename: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, filename } = await params
  const productName = decodeURIComponent(name)
  const safeFilename = sanitizeFilename(decodeURIComponent(filename))

  try {
    const filePath = userProductPath(userId, productName, 'mascot-files', safeFilename)
    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentTypeFor(safeFilename) },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
```

---

## File 3: app/api/products/[name]/slot/[slot]/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/slot/[slot]/route.ts`:

```ts
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { contentTypeFor, firstFile, userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string; slot: string }>
}

const ALLOWED_SLOTS = ['etsy-hero', 'etsy-expressions', 'etsy-files', 'etsy-preview', 'etsy-detail', 'etsy-branding']

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, slot } = await params
  const productName = decodeURIComponent(name)

  if (!ALLOWED_SLOTS.includes(slot)) return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })

  try {
    const dir = userProductPath(userId, productName, 'assets', slot)
    const file = firstFile(dir)
    if (!file) return new NextResponse(null, { status: 204 })
    const filePath = userProductPath(userId, productName, 'assets', slot, file)
    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentTypeFor(file) },
    })
  } catch {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, slot } = await params
  const productName = decodeURIComponent(name)

  if (!ALLOWED_SLOTS.includes(slot)) return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })

  const ext = (request.headers.get('content-type') ?? '').includes('png') ? '.png'
    : (request.headers.get('content-type') ?? '').includes('webp') ? '.webp'
    : (request.headers.get('content-type') ?? '').includes('gif') ? '.gif'
    : '.jpg'

  try {
    const dir = userProductPath(userId, productName, 'assets', slot)
    fs.mkdirSync(dir, { recursive: true })
    // clear existing
    for (const f of fs.readdirSync(dir)) fs.rmSync(`${dir}/${f}`)
    const buffer = Buffer.from(await request.arrayBuffer())
    fs.writeFileSync(`${dir}/image${ext}`, buffer)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, slot } = await params
  const productName = decodeURIComponent(name)

  if (!ALLOWED_SLOTS.includes(slot)) return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })

  try {
    const dir = userProductPath(userId, productName, 'assets', slot)
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) fs.rmSync(`${dir}/${f}`)
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
}
```

---

## File 4: app/api/products/[name]/rename/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/rename/route.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR, sanitizeName } from '@/lib/api-files'
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

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const oldName = decodeURIComponent(name)
  const { newName } = (await request.json()) as { newName: string }
  const sanitizedNew = sanitizeName(newName ?? '')
  if (!sanitizedNew) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })

  const existing = await prisma.product.findUnique({ where: { userId_name: { userId, name: oldName } } })
  if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Rename FS directory
  const oldDir = path.join(PRODUCTS_DIR, userId, oldName)
  const newDir = path.join(PRODUCTS_DIR, userId, sanitizedNew)
  if (fs.existsSync(oldDir)) {
    fs.renameSync(oldDir, newDir)
  }

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: { name: sanitizedNew },
    include: { files: true },
  })

  return NextResponse.json(toConfig(updated))
}
```

---

## File 5: app/api/products/[name]/duplicate/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/duplicate/route.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PRODUCTS_DIR, sanitizeName } from '@/lib/api-files'
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

function cpRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) cpRecursive(srcPath, destPath)
    else fs.copyFileSync(srcPath, destPath)
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
    include: { files: true },
  })
  if (!source) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Copy FS directory
  const srcDir = path.join(PRODUCTS_DIR, userId, sourceName)
  const destDir = path.join(PRODUCTS_DIR, userId, sanitizedNew)
  cpRecursive(srcDir, destDir)

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
      complete: false,
      files: {
        create: source.files.map((f) => ({
          filename: f.filename,
          origName: f.origName,
          folder: f.folder,
          variant: f.variant,
        })),
      },
    },
    include: { files: true },
  })

  return NextResponse.json(toConfig(duplicate))
}
```

---

## File 6: app/api/products/[name]/veado/route.ts

Replace `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/api/products/[name]/veado/route.ts`:

```ts
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { firstFile, userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  try {
    const dir = userProductPath(userId, productName, 'veado-file')
    const file = firstFile(dir)
    if (!file) return new NextResponse(null, { status: 204 })
    const buffer = fs.readFileSync(userProductPath(userId, productName, 'veado-file', file))
    return new NextResponse(buffer, { headers: { 'Content-Type': 'application/octet-stream' } })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name } = await params
  const productName = decodeURIComponent(name)

  try {
    const dir = userProductPath(userId, productName, 'veado-file')
    fs.mkdirSync(dir, { recursive: true })
    for (const f of fs.readdirSync(dir)) fs.rmSync(`${dir}/${f}`)
    const buffer = Buffer.from(await request.arrayBuffer())
    fs.writeFileSync(`${dir}/scene.veado`, buffer)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
}
```

---

## Verification
- All 6 files created/replaced
- Print: === COMPLETE: file + slot + rename + duplicate routes ===
