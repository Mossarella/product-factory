# Batch 3A — EtsySlots, EtsyListing, LicenseBanner

Read `docs/v2-conventions.md` first.
Read `lib/types.ts` for shared types.
Working directory: `/Users/Noppheera.Bha/Desktop/Work/product-factory`

## `components/LicenseBanner.tsx`
`'use client'`

Props:
```ts
interface Props {
  plan: 'free' | 'pro'
  activatedAt?: string
  onActivate: (key: string) => Promise<void>
  onBuyClick: () => void
}
```

UI:
- If plan === 'pro': show nothing (return null) OR a subtle "Pro ✓" badge in top-right
- If plan === 'free':
  - Sticky banner at top of page: `border-b border-zinc-800 bg-zinc-950 px-4 py-2 flex items-center gap-3 flex-wrap`
  - Left: "Free plan — 3 products max"
  - Middle: license key input + "Activate" button
  - Right: "Upgrade → $29 one-time" button (violet primary)

Activate flow:
- Input: `placeholder="Enter license key"`
- Button click → call `onActivate(key)` → show loading state → on success show "✓ Activated!"
- On error: show red error message inline

---

## `components/EtsySlots.tsx`
`'use client'`

Displays the 6 Etsy listing image slots for a product.

Props:
```ts
interface Props {
  activeProduct: string
}
```

ETSY_SLOTS constant (same as v1):
```ts
const ETSY_SLOTS = [
  { slot: 'etsy-hero',        label: 'Hero image',            hint: 'mascot + title + compatibility' },
  { slot: 'etsy-expressions', label: 'Expressions showcase',  hint: 'all states on one image' },
  { slot: 'etsy-files',       label: 'Included files preview', hint: 'folder/file list screenshot' },
  { slot: 'etsy-preview',     label: 'Preview / GIF',         hint: 'short loop or animation' },
  { slot: 'etsy-detail',      label: 'Zoomed detail shot',    hint: 'texture / close-up' },
  { slot: 'etsy-branding',    label: 'Thank you / branding',  hint: 'your branding card' },
]
```

Each slot row: `flex gap-3 items-center border border-zinc-800 bg-zinc-900 p-2`
- Slot number (right-aligned, text-zinc-600 w-5)
- Thumbnail 80×56: img or video (if video/* mime) or `?` placeholder
- Info column: label, `products/<name>/assets/<slot>/` path (dim), status (✓ loaded / — empty with hint)
- Buttons: "Pick file" or "Replace" + "✕ Clear" (when loaded)

Drag & drop per slot: dragover highlights border-violet-500, drop uploads immediately.

Load state: on mount + on activeProduct change, fetch `/api/products/<name>/slot/<slot>` (HEAD request to check existence, or just attempt GET and check ok status).

Upload: POST to `/api/products/<name>/slot/<slot>` with raw binary + `X-Filename` header.
Clear: DELETE to `/api/products/<name>/slot/<slot>`.

---

## `components/EtsyListing.tsx`
`'use client'`

Props:
```ts
interface Props {
  activeProduct: string | null
  config: ProductConfig        // from lib/types.ts
  files: FileEntry[]           // from FileManager state
  fixedAssets: FixedAssetDef[] // for "has veado/extra file" detection
  etsyTags: string[]
  onTagsChange: (tags: string[]) => void
}
```

### D1: Etsy tag chip editor
- Show tags as removable chips: `inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono border border-zinc-700 bg-zinc-900`
- Remove chip: click ✕ on chip
- Add tag: text input + Enter or "Add" button
- Max 13 tags — disable input when at 13
- Count badge: `X / 13` (green ≤10, yellow 11-12, red when 13)
- "Suggest" button: fills with generic digital product tag defaults:
  `["digital download", "instant download", "etsy digital", "digital art", "printable", "png file", "commercial use", "personal use", "zip file", "digital file", "creative assets", "clipart", "artwork"]`
  (Only fills empty slots up to 13)

### D2: Readiness checklist
Compact grid above the description preview:
```
Listing readiness:
  ✓ Title set (42 chars)     ✓ Price set ($8.50)
  ✓ Description              ✗ Tags (3/13)
  ○ Hero image               ✓ Files present
```
- ✓ = text-emerald-500, ✗ = text-red-400, ○ = text-zinc-600
- Clicking ✗ or ○ items should scroll to the relevant section (use `document.getElementById(...).scrollIntoView`)

Check logic:
- Title set: `config.etsyTitle.length > 0`
- Price set: `config.price > 0`
- Description: `config.description.length > 0`
- Tags: `etsyTags.length >= 10` (yellow if < 10, green if ≥ 10)
- Hero image: checked via slot load state (pass as prop `heroImageLoaded: boolean`)
- Files present: `files.length > 0`

### D3: Description preview + copy
- "Refresh Description" button → fetches template, fills it, shows in `<pre>` box
- "Copy Description" button → copies to clipboard
- "Copy full listing" mega-button → copies:
  ```
  TITLE:
  <etsyTitle>

  DESCRIPTION:
  <filled etsy template>

  TAGS:
  <comma-separated tags>

  PRICE: $<price> (<licenseType>)
  ```
- Flash "Copied!" message after copy (2s)

The template filling happens client-side using `lib/templates.ts` `buildEtsyText()`.
Since `buildEtsyText` reads from filesystem (server), instead expose a `/api/templates/etsy` GET
route that returns the raw template string, OR better: fetch `/templates/etsy.txt` directly
(Next.js serves files from `public/` — but templates/ is not in public/).

Better approach: create `app/api/templates/[name]/route.ts` that reads `templates/<name>.txt` and returns text/plain.

### `app/api/templates/[name]/route.ts` (create this too)
```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
export async function GET(_: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  // security: only allow alphanumeric + dash + dot names
  if (!/^[\w\-]+\.txt$/.test(name)) return NextResponse.json({ error: 'Bad name' }, { status: 400 })
  const filePath = path.join(process.cwd(), 'templates', name)
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    return new NextResponse(text, { headers: { 'Content-Type': 'text/plain' } })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
```

Then in EtsyListing, on mount: `fetch('/api/templates/etsy.txt')` to get the template string.
Do the filling client-side using a copy of the `fillTemplate` logic inlined or imported from `lib/templates.ts`
(note: lib/templates.ts also has `buildReadmeText` which uses `fs` — split it: keep `fillTemplate` as
a pure function that takes the template string as argument, and export it separately so it can be
used client-side without triggering Node.js imports).

Refactor `lib/templates.ts` so that:
- `fillTemplate(templateStr: string, d: TemplateData): string` — pure, no fs (client-safe)
- `buildReadmeText(d: TemplateData): string` — reads file, calls fillTemplate (server-only)
- `buildEtsyText(d: TemplateData): string` — reads file, calls fillTemplate (server-only)

Print `=== COMPLETE: batch-3a-etsy-license ===` when done.
