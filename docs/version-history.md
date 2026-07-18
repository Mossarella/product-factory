# Spec: Version History

## Overview
Every "Build Product" click already creates a `ProductBuild` row (version,
filename, fileSize, manifest) but only the latest one is reachable. This
feature surfaces the full build history per product with a short changelog
line per version, lets a seller download any past release, and lets them
revert to an old release (re-publish its exact artifact as the new current
version) from the Factory page.

## Follows the pattern of
- `app/api/products/[name]/build/route.ts` / `build/latest/route.ts` — auth
  pattern, `userProductPath()` file layout, `prisma.$transaction` for the
  version-bump + row-create pair.
- `lib/zip-server.ts` — where ZIP/manifest logic lives; JSZip is already a
  server-side dependency here.
- `components/BuildProduct.tsx` — client component calling the build API,
  Card-based result panel styling.
- `app/app/collection/page.tsx` detail panel — `Separator`-delimited
  sections, `StatusBadge`/`Badge` styling, existing Download button pattern
  (`detail.latestBuild` → `/build/latest` link).

## Scope decisions (already resolved with the user)
- **Changelog per version**: optional free-text "What changed?" note typed
  at Build time; if left blank, auto-generate an honest summary by diffing
  the new manifest against the previous build's manifest (files added/
  removed by folder, fixed assets added/updated, README content changed via
  hash comparison). Never fabricate narrative content (e.g. nothing like
  "Fixed VEADO config" — VEADO files aren't part of the build/manifest at
  all, so that can't be honestly derived).
- **Placement split**: Collection page's detail panel gets a read-only
  Version History list with a Download action per version. Factory page
  gets a Version History section with a Revert action per version (no
  download there — keeps Factory's action singular).
- **Revert semantics**: "revert to vN" does NOT touch the live editable
  draft (`MascotFile`/`FixedAssetFile`/`Product` config fields stay
  whatever they currently are). It re-publishes vN's exact stored ZIP as a
  brand new version (bumps `buildVersion`, creates a new `ProductBuild` row
  whose file is a copy of vN's ZIP with `manifest.json` updated in place to
  the new version number/timestamp). This is the only honest interpretation
  given what's actually persisted — full historical draft-state snapshots
  aren't stored, only build artifacts are.

## Architecture check
- New Prisma fields are pure additions (`ProductBuild.changelog`,
  `ProductBuild.revertedFrom`) — additive migration, same low-risk shape as
  the four prior migrations this session.
- New routes follow the existing `app/api/products/[name]/build/**`
  segment structure; no new architectural layer.
- `lib/build-changelog.ts` is a new pure, dependency-free function — unit
  testable with no mocks, same as `lib/template-rules.ts`.

## Implementation

### 1. `prisma/schema.prisma` — `ProductBuild` additions
```prisma
model ProductBuild {
  id           String   @id @default(cuid())
  productId    String
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  version      Int
  filename     String
  fileSize     Int
  manifest     Json
  changelog    String   @default("")
  revertedFrom Int?
  createdAt    DateTime @default(now())

  @@unique([productId, version])
  @@index([productId])
}
```
Run via `npx prisma migrate dev --name add_build_changelog` (or hand-write
SQL + `migrate deploy` if non-interactive, same as prior migrations in this
project). I (the orchestrator) run this step myself, not a subagent —
consistent with prior migrations this session.

### 2. `lib/zip-server.ts` (modify)
- Add `readmeHash: string` to the `BuildManifest` interface.
- In `buildZipBuffer()`, compute it with Node's `crypto`:
  ```ts
  import { createHash } from 'crypto'
  ...
  readmeHash: createHash('sha256').update(opts.readmeText).digest('hex'),
  ```
  added into the returned `manifest` object (alongside `warnings`, etc).
- Add a new exported function for revert:
  ```ts
  export async function rebuildManifestForRevert(
    buffer: Buffer,
    overrides: { version: number; builtAt: string },
  ): Promise<{ buffer: Buffer; manifest: BuildManifest }> {
    const zip = await JSZip.loadAsync(buffer)
    const manifestEntry = zip.file('manifest.json')
    const previousManifest = JSON.parse(await manifestEntry!.async('text')) as BuildManifest
    const manifest: BuildManifest = { ...previousManifest, version: overrides.version, builtAt: overrides.builtAt }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2))
    const rebuilt = await zip.generateAsync({ type: 'nodebuffer' })
    return { buffer: rebuilt, manifest }
  }
  ```
  This keeps the ZIP's embedded `manifest.json` internally consistent with
  the DB row after a revert, instead of leaving a stale version number
  inside the artifact.

### 3. `lib/build-changelog.ts` (new, pure function)
```ts
import type { BuildManifest } from './zip-server'

function fileKey(f: { folder: string; origName: string }) {
  return `${f.folder}::${f.origName}`
}

function assetKey(a: { assetKey: string; zipFilename: string }) {
  return `${a.assetKey}::${a.zipFilename}`
}

export function generateChangelog(current: BuildManifest, previous: BuildManifest | null): string {
  if (!previous) return 'Initial build'

  const fragments: string[] = []

  const prevFileKeys = new Set(previous.files.map(fileKey))
  const currFileKeys = new Set(current.files.map(fileKey))
  const added = current.files.filter((f) => !prevFileKeys.has(fileKey(f)))
  const removed = previous.files.filter((f) => !currFileKeys.has(fileKey(f)))

  if (added.length > 0) {
    const folderCounts = new Map<string, number>()
    for (const f of added) folderCounts.set(f.folder, (folderCounts.get(f.folder) ?? 0) + 1)
    if (folderCounts.size === 1) {
      const [folder, count] = [...folderCounts.entries()][0]
      fragments.push(`+ Added ${count} file${count !== 1 ? 's' : ''} to ${folder}`)
    } else {
      fragments.push(`+ Added ${added.length} files`)
    }
  }
  if (removed.length > 0) {
    fragments.push(`− Removed ${removed.length} file${removed.length !== 1 ? 's' : ''}`)
  }

  const prevAssetKeys = new Set(previous.fixedAssets.map(assetKey))
  const prevAssetIds = new Set(previous.fixedAssets.map((a) => a.assetKey))
  const changedAssets = current.fixedAssets.filter((a) => !prevAssetKeys.has(assetKey(a)))
  const newAssets = changedAssets.filter((a) => !prevAssetIds.has(a.assetKey))
  const updatedAssets = changedAssets.filter((a) => prevAssetIds.has(a.assetKey))
  if (newAssets.length > 0) fragments.push(`+ Added ${newAssets.map((a) => a.assetKey).join(', ')}`)
  if (updatedAssets.length > 0) fragments.push(`+ Updated ${updatedAssets.map((a) => a.assetKey).join(', ')}`)

  if (current.readmeHash && previous.readmeHash && current.readmeHash !== previous.readmeHash) {
    fragments.push('+ Updated README')
  }

  return fragments.length > 0 ? fragments.join(', ') : 'No changes detected'
}
```

### 4. `app/api/products/[name]/build/route.ts` (modify)
- Rename `_request` param to `request` (its body is now read).
- Add `builds: { orderBy: { version: 'desc' }, take: 1 }` to the existing
  `prisma.product.findUnique` include (alongside `files`, `fixedAssetFiles`,
  `template`).
- Before building the response, read the optional body:
  ```ts
  const body = await request.json().catch(() => ({})) as { notes?: string }
  const trimmedNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) : ''
  ```
- After `buildZipBuffer()` returns `manifest`, compute:
  ```ts
  const previousManifest = (product.builds[0]?.manifest as unknown as BuildManifest) ?? null
  const changelog = trimmedNotes || generateChangelog(manifest, previousManifest)
  ```
  (import `generateChangelog` from `@/lib/build-changelog`, `BuildManifest`
  type from `@/lib/zip-server`)
- Add `changelog` to the `prisma.productBuild.create({ data: { ... } })`
  call.
- Add `changelog` to the final `NextResponse.json({ version, manifest,
  warnings, hasRequiredFailures, changelog })`.
- Add a new `GET` handler in the same file (list all builds — parallel to
  how `config/route.ts` has both GET and POST):
  ```ts
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
  ```

### 5. `app/api/products/[name]/build/[version]/route.ts` (new)
GET, auth-gated. Downloads one specific version's stored ZIP. Blueprint:
`app/api/products/[name]/build/latest/route.ts`, adapted to look up by
version instead of "latest":
```ts
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { userProductPath } from '@/lib/api-files'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, version } = await params
  const productName = decodeURIComponent(name)
  const versionNumber = Number(version)
  if (!Number.isInteger(versionNumber)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { builds: { where: { version: versionNumber }, take: 1 } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const build = product.builds[0]
  if (!build) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

  try {
    const filePath = userProductPath(userId, product.name, 'builds', build.filename)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
    }
    const downloadName = `${(product.productName || product.name).replace(/[^\w\- ]/g, '')}Pack-v${build.version}.zip`
    return new NextResponse(fs.readFileSync(filePath), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Build file not found' }, { status: 404 })
  }
}
```

### 6. `app/api/products/[name]/build/[version]/revert/route.ts` (new)
POST, auth-gated.
```ts
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { userProductPath } from '@/lib/api-files'
import { rebuildManifestForRevert } from '@/lib/zip-server'

interface RouteContext {
  params: Promise<{ name: string; version: string }>
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const { name, version } = await params
  const productName = decodeURIComponent(name)
  const targetVersion = Number(version)
  if (!Number.isInteger(targetVersion)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 })

  const product = await prisma.product.findUnique({
    where: { userId_name: { userId, name: productName } },
    include: { builds: { where: { version: targetVersion }, take: 1 } },
  })
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const targetBuild = product.builds[0]
  if (!targetBuild) return NextResponse.json({ error: 'Build not found' }, { status: 404 })

  const sourcePath = userProductPath(userId, product.name, 'builds', targetBuild.filename)
  if (!fs.existsSync(sourcePath)) return NextResponse.json({ error: 'Build file not found' }, { status: 404 })

  const newVersion = product.buildVersion + 1
  const builtAt = new Date().toISOString()
  const { buffer, manifest } = await rebuildManifestForRevert(fs.readFileSync(sourcePath), {
    version: newVersion,
    builtAt,
  })

  const filename = `v${newVersion}.zip`
  const directory = userProductPath(userId, product.name, 'builds')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, filename), buffer)

  const changelog = `Reverted to v${targetVersion}`

  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { buildVersion: newVersion } }),
    prisma.productBuild.create({
      data: {
        productId: product.id,
        version: newVersion,
        filename,
        fileSize: buffer.byteLength,
        manifest: manifest as unknown as object,
        changelog,
        revertedFrom: targetVersion,
      },
    }),
  ])

  return NextResponse.json({ version: newVersion, revertedFrom: targetVersion, changelog })
}
```

### 7. `lib/types.ts` (modify)
Add:
```ts
export interface BuildHistoryEntry {
  version: number
  fileSize: number
  changelog: string
  revertedFrom: number | null
  createdAt: string
}
```

### 8. `components/VersionHistory.tsx` (new, client component)
Shared by both pages via a `mode` prop — avoids duplicating the fetch/list
logic. Blueprint for styling: `components/BuildProduct.tsx` (Card usage,
font-mono/zinc palette) and the Collection page's existing Download button
(`buttonVariants({ variant: 'outline' })` + `cn`).

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { BuildHistoryEntry } from '@/lib/types'

interface Props {
  activeProduct: string
  mode: 'revert' | 'download'
}

export function VersionHistory({ activeProduct, mode }: Props) {
  const [history, setHistory] = useState<BuildHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`)
    if (response.ok) setHistory(await response.json() as BuildHistoryEntry[])
    setLoading(false)
  }, [activeProduct])

  useEffect(() => { void refresh() }, [refresh])

  async function revert(version: number) {
    setRevertingVersion(version)
    setError(null)
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(activeProduct)}/build/${version}/revert`,
        { method: 'POST' },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Could not revert')
        return
      }
      await refresh()
    } finally {
      setRevertingVersion(null)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  }

  if (loading) return <p className="text-xs text-zinc-600 font-mono animate-pulse">Loading version history…</p>
  if (history.length === 0) return <p className="text-xs text-zinc-600 font-mono italic">No builds yet.</p>

  const currentVersion = history[0]?.version

  return (
    <div className="space-y-2 font-mono">
      {error && <p className="text-xs text-red-400">{error}</p>}
      {history.map((entry) => (
        <Card key={entry.version} className="gap-0 border border-zinc-800 bg-zinc-900 px-4 py-3 ring-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-200">
                v{entry.version}
                {entry.version === currentVersion && <span className="ml-2 text-xs text-emerald-400">Current</span>}
              </p>
              <p className="text-xs text-zinc-600">{formatDate(entry.createdAt)}</p>
            </div>
            {mode === 'download' ? (
              <a
                href={`/api/products/${encodeURIComponent(activeProduct)}/build/${entry.version}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-auto rounded-none px-3 py-1 text-xs')}
              >
                ⬇ Download
              </a>
            ) : (
              <Button
                variant="outline"
                disabled={entry.version === currentVersion || revertingVersion !== null}
                onClick={() => void revert(entry.version)}
                className="h-auto rounded-none px-3 py-1 text-xs"
              >
                {revertingVersion === entry.version ? 'Reverting…' : '↩ Revert'}
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">{entry.changelog || '—'}</p>
        </Card>
      ))}
    </div>
  )
}
```

### 9. `components/BuildProduct.tsx` (modify)
- Add local state `const [notes, setNotes] = useState('')`.
- Above the "📦 Build Product" button, add an optional single-line
  `<Input>` (from `@/components/ui/input`, same import already used
  elsewhere e.g. Collection page) with placeholder `"What changed? (optional)"`,
  bound to `notes`/`setNotes`, disabled while `building`.
- In `build()`, send it:
  ```ts
  const response = await fetch(`/api/products/${encodeURIComponent(activeProduct)}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
  ```
  and `setNotes('')` on success.
- Extend `BuildResult` with `changelog: string` and render it in the ready
  panel, e.g. a `<p className="mt-2 text-xs text-zinc-500">{result.changelog}</p>`
  under the existing warnings block.

### 10. `app/app/factory/page.tsx` (modify)
Add a new numbered section after "7. Build" (which stays as-is):
```tsx
{config && (
  <Card className="gap-0 px-4">
    <h2 className="text-xs text-zinc-600 uppercase tracking-widest mb-3">8. Version History</h2>
    <VersionHistory activeProduct={activeProduct!} mode="revert" />
  </Card>
)}
```
Import `VersionHistory` from `@/components/VersionHistory`.

### 11. `app/app/collection/page.tsx` (modify)
Add a new detail-panel section using the same `Separator`-delimited
pattern as the existing sections (e.g. right after the "Files" section,
before "Product Template"):
```tsx
<Separator className="mb-5" />
<div className="mb-5">
  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Version History</p>
  <VersionHistory activeProduct={detail.name} mode="download" />
</div>
```
Import `VersionHistory` from `@/components/VersionHistory`. This replaces
nothing — the existing header "⬇ Download (vN)" button stays as a quick
shortcut to the latest build.

## Files Summary
| Action | Path | Blueprint |
|--------|------|-----------|
| MODIFY | `prisma/schema.prisma` | additive fields on `ProductBuild` |
| MODIFY | `lib/zip-server.ts` | add `readmeHash`, `rebuildManifestForRevert()` |
| CREATE | `lib/build-changelog.ts` | pure diff function |
| MODIFY | `app/api/products/[name]/build/route.ts` | add GET (list), notes/changelog in POST |
| CREATE | `app/api/products/[name]/build/[version]/route.ts` | based on `build/latest/route.ts` |
| CREATE | `app/api/products/[name]/build/[version]/revert/route.ts` | based on `build/route.ts` |
| MODIFY | `lib/types.ts` | add `BuildHistoryEntry` |
| CREATE | `components/VersionHistory.tsx` | based on `BuildProduct.tsx` styling |
| MODIFY | `components/BuildProduct.tsx` | optional notes input, show changelog |
| MODIFY | `app/app/factory/page.tsx` | mount section 8, mode="revert" |
| MODIFY | `app/app/collection/page.tsx` | mount Version History, mode="download" |

## Out of Scope
- No restoring of live editable draft state (`MascotFile`/`FixedAssetFile`/
  config fields) on revert — only the packaged artifact is republished.
- No pagination on the history list (bounded by how many times a seller
  clicks Build; fine for now, same precedent as no-history-UI in the prior
  build feature).
- No delete/prune of old build ZIPs on disk.

## Verification
1. `npx prisma migrate dev --name add_build_changelog` — confirm additive.
2. `npx tsc --noEmit`, `bun test tests/unit`, `bun test tests/integration`.
3. Factory: build a product with an empty notes field twice (add a file
   between builds) — confirm v2's auto-changelog mentions the added
   folder; build a third time with a typed note — confirm it's stored
   verbatim instead of a diff summary.
4. Factory: Version History section lists all 3 versions, "Current" badge
   on the latest, Revert disabled on the current version only.
5. Click Revert on v1 — confirm a new v4 appears at the top marked
   Current, with changelog "Reverted to v1", and that downloading it
   produces the same file contents as v1's original ZIP.
6. Collection: select the same product — confirm Version History shows
   all 4 versions with working Download links (spot check one old
   version's ZIP has the right `manifest.json` version number inside).
