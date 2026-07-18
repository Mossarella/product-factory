# Spec: One-Click "Build Product"

## Overview
A single "Build Product" action that runs the whole packaging pipeline
server-side (validate → generate README → bundle shared assets → build
folder structure → generate manifest → create ZIP → save a version),
persists the resulting ZIP as a numbered build (`v1`, `v2`, ...), and
replaces the current client-only "Download ZIP" button with a staged,
satisfying build animation ending in a persistent "Ready" panel. Once a
product has at least one build, its ZIP becomes downloadable from the
Collection page too — without needing to reopen the Factory page.

This is explicitly the app's "Deploy" moment — the first thing in this
app where an action produces a durable, versioned, server-stored artifact
rather than an ephemeral browser-only download.

## Follows the pattern of
- `lib/zip.ts` — the exact grouping/filename-resolution algorithm
  (`groupFiles`, `resolveFilename`) gets ported to a new server-side
  module; same naming convention, same folder structure, just reading
  bytes from disk (Node `Buffer`) instead of in-memory browser `File`s.
- `lib/templates-server.ts`'s `buildReadmeText()` — **already exists,
  already correct, currently unused dead code** (confirmed via repo-wide
  grep: nothing calls it). The client instead duplicates the same
  fill-template logic inline. This feature is what finally wires it up.
- `lib/template-rules.ts`'s `validateProduct()` — direct reuse for the
  "Check required assets" step (already built for Product Template
  validation).
- `app/api/products/[name]/asset/route.ts` — the guarded
  `userProductPath()` + raw-write-to-disk pattern, blueprint for where
  the built ZIP file gets stored.
- `app/api/slot/[name]/route.ts` — the shop-wide global-default asset
  read pattern (`assetPath()` + `firstFile()`), needed for including the
  thank-you/how-to defaults in builds that never got a per-product
  override (see [[project-fixed-asset-persistence]] — same nuance
  applies here as it did there).
- `components/ProductSelector.tsx`'s `saveFlash` — the established
  transient-success convention (2000ms, `text-emerald-400`) this feature
  extends into a persistent (not auto-dismissing) "Ready" panel, since
  the build result needs to stay visible with a Download button, not
  flash and disappear.

## Scope decisions
- **Simple integer versioning** (`v1`, `v2`, `v3`, ...), not the
  mockup's illustrative `v1.4` — there's no existing concept of
  major/minor bumps, and inventing one (what triggers a minor vs a major
  bump?) would be fabricated complexity with no real signal behind it.
  Every successful build is a new integer version, full stop.
- **Validation stays advisory, not blocking** — consistent with the
  standing preference recorded from this app's Product Template work
  ("about gate. nah let it flexible like this"). "Validate files" and
  "Check required assets" both run for real and their results are
  recorded in the manifest and surfaced in the final panel, but a failed
  required rule or a missing on-disk file does **not** stop the build —
  it downgrades the final state from 🟢 to 🟡 with a warning count, and
  missing files are skipped (with a manifest note) rather than crashing
  the whole build.
- **Every build is a new version, even with no changes** — matches
  "Deploy" semantics (redeploying with no diff is still a new deploy).
  No change-detection/diffing to skip a version bump.
- **No grid-level indicator in Collection** — same scoping precedent as
  the earlier duplicate/template-validation work; the Download button and
  version number live in the detail panel only.

## Requirements

### Functional — Data model (Prisma)

```prisma
model ProductBuild {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  version   Int
  filename  String
  fileSize  Int
  manifest  Json
  createdAt DateTime @default(now())

  @@unique([productId, version])
  @@index([productId])
}
```

Add to `Product`: `builds ProductBuild[]` and `buildVersion Int @default(0)`
(the running counter — incremented on each successful build, becomes the
new build's `version`).

Migration name: `add_product_build` — pure addition, safe/lossless like
the two prior migrations this session.

### Functional — Server-side ZIP module (`lib/zip-server.ts`, new, server-only)

Ports `lib/zip.ts`'s exact algorithm to Node `fs`/`Buffer`:

```ts
import JSZip from 'jszip'
import fs from 'fs'
import { userProductPath, assetPath, firstFile } from './api-files'
import { sanitizeAssetFilename } from './utils'

interface BuildMascotFile {
  filename: string   // stored on-disk name
  origName: string
  folder: string
  variant: string
}

interface BuildFixedAsset {
  assetKey: string
  filename: string   // stored on-disk name, if persisted
  origName: string
}

// Same algorithm as lib/zip.ts's resolveFilename, extension from origName
function extension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1)
}

export function resolveFilename(
  productName: string,
  f: { origName: string; folder: string; variant: string },
  indexInFolder: number,
  totalInFolder: number,
): string {
  const ext = extension(f.origName)
  const base = f.variant
    ? `${productName}_${f.folder}_${f.variant}`
    : totalInFolder === 1
      ? `${productName}_${f.folder}`
      : `${productName}_${f.folder}_${indexInFolder + 1}`
  return `${base}.${ext}`
}

function groupFiles(files: BuildMascotFile[]): Map<string, BuildMascotFile[]> {
  const folders = new Map<string, BuildMascotFile[]>()
  for (const file of files) {
    const group = folders.get(file.folder) ?? []
    group.push(file)
    folders.set(file.folder, group)
  }
  return folders
}

export interface ManifestFileEntry { folder: string; zipFilename: string; origName: string }
export interface ManifestAssetEntry { assetKey: string; zipFilename: string; source: 'override' | 'shop-default' | 'missing' }
export interface ValidationEntry { ruleId: string; label: string; required: boolean; status: 'ok' | 'missing'; detail?: string }
export interface BuildManifest {
  version: number
  productName: string
  builtAt: string
  files: ManifestFileEntry[]
  fixedAssets: ManifestAssetEntry[]
  template: { id: string; name: string } | null
  validation: ValidationEntry[] | null
  warnings: string[]
}

// Known builtin fixed-asset defs — mirrors app/app/factory/page.tsx's
// INITIAL_FIXED_ASSETS. Duplicated here deliberately (see "Files to
// modify" below — the alternative is extracting a shared constant, which
// this spec does call for, see step 4).
const BUILTIN_ASSETS = [
  { id: 'thankyou', zipName: 'THANKYOU.png', globalSlot: 'thank-you-image' },
  { id: 'howto', zipName: 'HOWTO.png', globalSlot: 'how-to-use' },
]

export async function buildZipBuffer(opts: {
  userId: string
  storageProductName: string   // Product.name — stable disk-path key
  displayProductName: string   // Product.productName — used in filenames/readme
  mascotFiles: BuildMascotFile[]
  fixedAssetFiles: BuildFixedAsset[]
  readmeText: string
  version: number
  template: { id: string; name: string } | null
  validation: ValidationEntry[] | null
}): Promise<{ buffer: Buffer; manifest: BuildManifest }> {
  const zip = new JSZip()
  const warnings: string[] = []
  const manifestFiles: ManifestFileEntry[] = []
  const manifestAssets: ManifestAssetEntry[] = []

  const grouped = groupFiles(opts.mascotFiles)
  for (const [folder, files] of grouped) {
    files.forEach((file, index) => {
      const diskPath = userProductPath(opts.userId, opts.storageProductName, 'mascot-files', file.filename)
      if (!fs.existsSync(diskPath)) {
        warnings.push(`Skipped missing file: ${file.origName}`)
        return
      }
      const zipFilename = resolveFilename(opts.displayProductName, file, index, files.length)
      zip.folder('Files')!.folder(folder)!.file(zipFilename, fs.readFileSync(diskPath))
      manifestFiles.push({ folder, zipFilename, origName: file.origName })
    })
  }

  zip.file('README.txt', opts.readmeText)

  // Persisted overrides first
  const overriddenKeys = new Set(opts.fixedAssetFiles.map((f) => f.assetKey))
  for (const asset of opts.fixedAssetFiles) {
    const diskPath = userProductPath(opts.userId, opts.storageProductName, 'fixed-assets', asset.filename)
    if (!fs.existsSync(diskPath)) {
      warnings.push(`Skipped missing fixed asset: ${asset.assetKey}`)
      continue
    }
    const zipFilename = `${sanitizeAssetFilename(asset.assetKey)}.${extension(asset.origName) || 'png'}`
    zip.file(zipFilename, fs.readFileSync(diskPath))
    manifestAssets.push({ assetKey: asset.assetKey, zipFilename, source: 'override' })
  }

  // Shop-wide defaults for any builtin asset with no per-product override
  for (const builtin of BUILTIN_ASSETS) {
    if (overriddenKeys.has(builtin.id)) continue
    const directory = assetPath(builtin.globalSlot)
    const filename = firstFile(directory)
    if (!filename) continue // no shop default configured; not an error
    zip.file(builtin.zipName, fs.readFileSync(`${directory}/${filename}`))
    manifestAssets.push({ assetKey: builtin.id, zipFilename: builtin.zipName, source: 'shop-default' })
  }

  const manifest: BuildManifest = {
    version: opts.version,
    productName: opts.displayProductName,
    builtAt: new Date().toISOString(),
    files: manifestFiles,
    fixedAssets: manifestAssets,
    template: opts.template,
    validation: opts.validation,
    warnings,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return { buffer, manifest }
}
```

*Note for the implementing agent:* verify `zip.generateAsync({ type: 'nodebuffer' })` and `zip.file(name, buffer)` against JSZip's actual TypeScript types in `node_modules/jszip` before finalizing — the exploration confirmed Node-Buffer support exists, but double-check the exact option string casing.

### Functional — Build endpoint (`app/api/products/[name]/build/route.ts`, new)

`POST` only, auth-gated:

1. Look up the product (`userId_name`) with `files: true, fixedAssetFiles: true, template: true` included. 404 if not found.
2. If `product.template` exists, call `validateProduct()` (from `lib/template-rules.ts`) with a `ProductConfig`-shaped object built from the product row (reuse the same mapping `config/route.ts`'s `toConfig()` already does) and `template.rules`. Otherwise `validation = null`.
3. Build a `TemplateData` object (from `lib/templates.ts`) for the README: `name: product.productName`, `etsyName: product.etsyTitle`, `shopName: CONFIG.shopName`, `contact: product.contact || CONFIG.contact`, `description: product.description || CONFIG.description`, `notes: product.notes || CONFIG.readmeFooter`, `licenseType`, `price`, `commercialPrice`, `currency`, `folders: product.folders.map((label) => ({ label, count: product.files.filter((f) => f.folder === label).length }))`, `etsyTags: product.etsyTags`.
4. Call `buildReadmeText(templateData)` from `lib/templates-server.ts` (finally wiring up this dead code).
5. Call `buildZipBuffer(...)` from the new `lib/zip-server.ts` with the product's files/fixedAssetFiles, the README text, the template info, and the validation result.
6. Compute the new version: `const version = product.buildVersion + 1`.
7. Write the ZIP to disk: `userProductPath(userId, product.name, 'builds', \`v${version}.zip\`)`.
8. Persist, wrapped in `prisma.$transaction` (this is the one place in this codebase worth the atomicity — it's the crux of "save a version," and an unguarded increment+insert has a real, if narrow, race window): update `Product.buildVersion` to `version` and create the `ProductBuild` row (`version`, `filename`, `fileSize`, `manifest`).
9. Response: `{ version, manifest, warnings: manifest.warnings, hasRequiredFailures: (validation ?? []).some(v => v.required && v.status === 'missing') }`.

### Functional — Download endpoint (`app/api/products/[name]/build/latest/route.ts`, new)

`GET` only, auth-gated. Looks up the product, then its highest-`version`
`ProductBuild` row (`orderBy: { version: 'desc' }, take: 1`). 404 if the
product has never been built. Reads the stored ZIP file from disk and
serves it with `Content-Type: application/zip` and
`Content-Disposition: attachment; filename="${product.productName || product.name}Pack.zip"`.

### Functional — `config/route.ts` extension

Add `latestBuild: { version: number; createdAt: string } | null` to
`toConfig()`'s output, sourced from including
`builds: { orderBy: { version: 'desc' }, take: 1 }` in the product query
and mapping the first entry (or `null`). Add `latestBuild` to
`ProductConfig` in `lib/types.ts`.

### Functional — Factory page: replace "Download ZIP" with "Build Product"

In `components/ProductSelector.tsx`, remove the existing `⬇ Download ZIP`
button and its `onDownloadZip` prop entirely (superseded). Keep
`Preview ZIP` as-is — unrelated, cheap, still useful independent of
building.

Add a new, larger "Build Product" button plus a result panel — this is
the "satisfying big button" the user asked for. New component
`components/BuildProduct.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const STEPS = [
  'Validate files',
  'Check required assets',
  'Generate README',
  'Insert shared assets',
  'Build folder structure',
  'Generate manifest',
  'Create ZIP',
  'Save version',
]

interface BuildResult {
  version: number
  warnings: string[]
  hasRequiredFailures: boolean
}

interface Props {
  activeProduct: string
}

export function BuildProduct({ activeProduct }: Props) {
  const [building, setBuilding] = useState(false)
  const [revealedSteps, setRevealedSteps] = useState(0)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function build() {
    setBuilding(true)
    setError(null)
    setResult(null)
    setRevealedSteps(0)

    const timer = setInterval(() => {
      setRevealedSteps((n) => (n < STEPS.length - 1 ? n + 1 : n))
    }, 220)

    try {
      const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`, { method: 'POST' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Build failed')
        return
      }
      const data: BuildResult = await response.json()
      setRevealedSteps(STEPS.length) // snap to fully revealed regardless of timer position
      setResult(data)
    } catch {
      setError('Build failed')
    } finally {
      clearInterval(timer)
      setBuilding(false)
    }
  }

  return (
    <div className="font-mono">
      <Button
        type="button"
        variant="default"
        disabled={building}
        onClick={() => void build()}
        className="w-full border border-violet-600 bg-violet-600 py-3 text-base font-bold text-zinc-100 hover:bg-violet-500 disabled:opacity-50"
      >
        {building ? 'Building…' : '📦 Build Product'}
      </Button>

      {building && (
        <Card className="mt-3 border border-zinc-800 bg-zinc-900 p-4 ring-0">
          <ul className="space-y-1.5 text-sm">
            {STEPS.map((step, index) => (
              <li key={step} className={index <= revealedSteps ? 'text-emerald-400' : 'text-zinc-700'}>
                {index <= revealedSteps ? '✓' : '○'} {step}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {result && !building && (
        <Card className="mt-3 border border-zinc-800 bg-zinc-900 p-4 ring-0">
          <p className={result.hasRequiredFailures ? 'text-yellow-400' : 'text-emerald-400'}>
            {result.hasRequiredFailures ? '🟡' : '🟢'} Product v{result.version} Ready
            {result.hasRequiredFailures && ' — required checks failed'}
          </p>
          {result.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-zinc-500">
              {result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
          <a
            href={`/api/products/${encodeURIComponent(activeProduct)}/build/latest`}
            className="mt-3 inline-block border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            ⬇ Download ZIP
          </a>
        </Card>
      )}
    </div>
  )
}
```

Mount `<BuildProduct activeProduct={activeProduct!} />` in
`app/app/factory/page.tsx`, replacing the old download button's spot —
place it as its own small numbered section (e.g. "7. Build") after the
existing "6. Etsy Listing" section, since building depends on everything
above it being in place. Only render when `config` exists.

*Note for the implementing agent:* the `setInterval` staged-reveal is a
deliberate presentational device — the real work happens in one request;
the timer just paces how the checklist fills in while waiting, and snaps
to fully-revealed the instant the real response lands (so a fast response
doesn't look truncated, and a slow one doesn't look stuck past the last
timer tick). This is not measuring real per-step progress.

### Functional — Collection page: Download button

In `app/app/collection/page.tsx`'s detail panel header (same row as the
existing Duplicate button and "Open in Factory →" link), add a Download
link/button:

```tsx
{detail.latestBuild ? (
  <a
    href={`/api/products/${encodeURIComponent(detail.name)}/build/latest`}
    className={cn(buttonVariants({ variant: 'outline' }), 'h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors')}
  >
    ⬇ Download (v{detail.latestBuild.version})
  </a>
) : (
  <Button
    variant="outline"
    disabled
    title="Build this product in the Factory page first"
    className="h-auto rounded-none px-4 py-1.5 text-xs font-mono"
  >
    ⬇ Download
  </Button>
)}
```

## Architecture check
- `lib/zip-server.ts` is server-only (uses Node `fs`) — never imported
  from a `'use client'` file.
- The build endpoint does all file I/O itself; the client sends no file
  data — everything needed already lives in Postgres + the per-product
  disk directories from the existing `MascotFile`/`FixedAssetFile`
  persistence.
- No change to `lib/zip.ts` (still used by the "Preview ZIP" tree-string
  feature, which stays client-only and unrelated to actual building).

## Files to create
| Path | Purpose |
|---|---|
| `lib/zip-server.ts` | Server-side ZIP assembly, ported from `lib/zip.ts` |
| `app/api/products/[name]/build/route.ts` | POST — run the full build pipeline |
| `app/api/products/[name]/build/latest/route.ts` | GET — serve the latest built ZIP |
| `components/BuildProduct.tsx` | Big button + staged checklist + Ready panel |
| `prisma/migrations/<timestamp>_add_product_build/migration.sql` | New table + counter |

## Files to modify
| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add `ProductBuild` model, `Product.builds`/`buildVersion` |
| `lib/types.ts` | `ProductConfig.latestBuild` |
| `app/api/products/[name]/config/route.ts` | Include/return `latestBuild` |
| `app/app/factory/page.tsx` | Mount `<BuildProduct>`, remove old `downloadZip`/`fillReadmeTemplate`/`gatherData` (superseded) |
| `components/ProductSelector.tsx` | Remove `⬇ Download ZIP` button + `onDownloadZip` prop |
| `app/app/collection/page.tsx` | Download button in detail header |

## Out of Scope
- Semantic (major.minor) versioning — simple integers only.
- Build history UI (listing past versions, downloading an older one) —
  only the latest build is downloadable. A `ProductBuild` history exists
  in the DB for future use but isn't surfaced yet.
- Blocking builds on failed validation — stays advisory (🟡 vs 🟢), per
  standing feedback.
- Real per-step progress instrumentation — the checklist animation is a
  paced presentational device over one request, not a streamed/SSE
  progress feed.
- Deleting old build ZIPs from disk (each build adds a file; no cleanup/
  retention policy in this phase).

## Tests (mandatory per project rule)
- `tests/unit/zip-server.test.ts` — `resolveFilename()` (same cases as
  the original `lib/zip.ts` algorithm: variant-based naming, single-file
  no-variant, multi-file no-variant index fallback) and the manifest
  shape from `buildZipBuffer()` with mocked `fs` reads.
- `tests/integration/products-build.test.ts` (new) — the build route:
  401 unauthenticated, 404 unknown product, 200 with an incrementing
  `version` across repeated calls, `hasRequiredFailures` reflecting a
  mocked `validateProduct()` result, warnings for a mocked-missing disk
  file. The latest-build download route: 401, 404 with no builds yet,
  200 with correct headers when a build exists.
- `tests/e2e/build-product.spec.ts` (new) — dev-bypass sign-in, create a
  product with a file, click "Build Product," confirm the checklist
  animates and the "Ready" panel appears with a working Download link;
  then from Collection, confirm the same product shows a working
  Download button.

## Verification
1. `npx prisma migrate dev --name add_product_build` (or hand-write +
   `migrate deploy` if non-interactive, same as the last two migrations
   this session) — confirm additive/clean.
2. `npx tsc --noEmit`, `bun test tests/unit`, `bun test tests/integration`.
3. In the Factory page: upload a file, click "Build Product" — confirm
   the checklist animates through all 8 steps and lands on
   "🟢 Product v1 Ready," then click Download and confirm a real ZIP
   downloads containing `Files/`, `README.txt`, and `manifest.json`.
4. Click "Build Product" again — confirm it becomes v2.
5. From the Collection page, select the same product — confirm the
   Download button shows "v2" and downloads the same ZIP without
   visiting the Factory page.
6. Assign a Product Template with a required rule the product doesn't
   satisfy, build again — confirm the panel shows 🟡 with the warning,
   and the build still completes (not blocked).
