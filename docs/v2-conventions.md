# v2 Conventions (read before implementing anything)

## Stack
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- No component library — plain Tailwind only
- No database — flat file JSON (`products/` dir, `license.json`, `keys.json`)
- File storage: local filesystem, same paths as v1

## Root path
`/Users/Noppheera.Bha/Desktop/Work/product-factory`

## Key directories
- `app/` — Next.js pages and API routes
- `components/` — React client components
- `lib/` — shared logic (no React)
- `templates/` — .txt template files
- `products/` — per-product data (gitignored, created at runtime)
- `assets/` — global shared assets

## Styling rules
- Tailwind utility classes only — no inline style objects, no custom CSS files
- Dark theme: bg-zinc-950 / bg-zinc-900 / bg-zinc-800 borders
- Text: text-zinc-100 (primary), text-zinc-400 (muted), text-zinc-600 (dim)
- Accent: violet-600 / violet-500 for focus/primary actions
- Green: emerald-600 for save/success
- Red: red-900/red-400 for danger
- Monospace font throughout: `font-mono`

## Component rules
- All interactive components: `'use client'` directive at top
- Server components only for pure data-fetching layouts
- Props typed with TypeScript interfaces inline or in same file
- No default exports from lib files — named exports only

## API route conventions (Next.js App Router)
```ts
// app/api/something/route.ts
import { NextRequest, NextResponse } from 'next/server'
export async function GET(req: NextRequest) { ... }
export async function POST(req: NextRequest) { ... }
```
- Use `NextResponse.json(data, { status: N })` for responses
- Dynamic segments: `app/api/products/[name]/config/route.ts` → param via `{ params }: { params: Promise<{ name: string }> }`, await params

## File path helpers (use in every API route that touches disk)
```ts
import path from 'path'
const ROOT = process.cwd()
const PRODUCTS_DIR = path.join(ROOT, 'products')
```

## product.json schema (v2)
```ts
interface ProductConfig {
  name: string           // folder name
  sku: string
  productName: string    // display name
  etsyTitle: string
  description: string
  notes: string
  contact: string
  price: number
  currency: string       // 'USD'
  licenseType: 'personal' | 'commercial' | 'both'
  commercialPrice?: number
  folders: string[]      // user-defined, default ['Main']
  mascotFiles: MascotFile[]
  etsyTags: string[]
  complete: boolean
  createdAt: string      // DD/MM/YYYY
}

interface MascotFile {
  id: string
  filename: string       // uuid.ext stored on disk
  origName: string
  folder: string         // which folder this file belongs to
  variant: string        // optional free-text (e.g. "512px", "Dark")
}
```

## Template variables
`{{name}}` `{{etsyName}}` `{{shopName}}` `{{contact}}` `{{description}}`
`{{notes}}` `{{licenseBlock}}` `{{folders}}` `{{etsyTags}}`

`{{folders}}` = multiline list of folder names + file counts
`{{licenseBlock}}` = auto-generated from licenseType + price

## License system
- `license.json` at root: `{ key, plan, activatedAt }`
- `keys.json` at root: `{ [key]: { plan, issuedAt, used } }`
- Free plan: max 3 products
- Pro plan: unlimited

## Backward compat with v1 products
- Old `product.json` may have `states[]` and `mascotFiles[].state/expression` fields
- Load gracefully: if no `folders`, default to `['Main']`; if mascotFile has no `folder`, assign 'Main'
