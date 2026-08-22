# Spec: Fixed Asset File Persistence

## Overview
Persists per-product fixed-asset files (thank-you card override, how-to
image override, template-driven custom asset slots) so they survive a
page reload instead of only existing as in-memory `File` blobs for one
Factory-page session. Mirrors the existing `MascotFile` persistence
pattern almost exactly.

## Follows the pattern of
- `prisma/schema.prisma`'s `MascotFile` model — direct blueprint for the
  new `FixedAssetFile` model.
- `app/api/products/[name]/file/route.ts` +
  `app/api/products/[name]/file/[filename]/route.ts` — direct blueprint
  for the new upload/download routes (same header convention, same
  `userProductPath()` guarded-join helper, same raw-binary-body pattern).
- `app/api/products/[name]/config/route.ts`'s delete-then-recreate pattern
  for `mascotFiles` on every save — direct blueprint for persisting
  `fixedAssetFiles` metadata.
- `app/app/factory/page.tsx`'s `loadProduct()` (mascotFiles → `FileEntry[]`
  restoration) and `saveProduct()` (upload then persist) — direct
  blueprint for the equivalent fixed-asset restore/save logic.

## Key design decision: which assets actually get persisted
Not every `FixedAssetDef` with a non-null `blob` should be persisted:

1. **Built-in assets (`thankyou`/`howto`)** auto-fetch a shop-wide global
   default image from `/api/slot/*` on every page mount, unconditionally
   setting `blob` — this happens whether or not the user ever touches
   them. If persistence naively saved every asset with a blob, every
   product would silently save a redundant copy of the shop default the
   moment it's viewed, which (a) defeats the point of a shared default and
   (b) freezes that product to a stale copy if the shop default image is
   later changed. **Only persist a built-in asset when the user has
   actually picked a file for it** (a genuine per-product override).
2. **Template-driven custom assets** (synthesized by the existing
   reconciliation `useEffect` for asset keys that appear in the selected
   template's `assets: string[]`) have a stable identity — the asset key
   is always the same string as long as it stays in the template's asset
   list — so these persist normally whenever they have a blob.
3. **Ad-hoc custom assets** added via the standalone "+ Add custom asset"
   button (unrelated to any template, `id: crypto.randomUUID()` per
   click) are **out of scope for this fix** — their slot *definition*
   itself (existence, label) isn't persisted anywhere today, only content
   files are, and the id is randomly regenerated every session, so there
   is no stable key to restore a file into on reload. Persisting the file
   without a way to recreate the slot on reload would silently drop the
   restored blob (no slot to attach it to). This carve-out should be
   called out in the UI/labeling if it comes up, but requires no code
   change — it's the existing session-only behavior for that specific
   sub-case, unchanged.

To implement decision #1, `FixedAssetDef` gains a new field:
`manuallyPicked?: boolean` — `undefined`/`false` when the blob is just the
auto-fetched shop default, `true` once the user picks a file via
`AssetSlot`'s file input (or once a persisted per-product override is
restored on load, since at that point it's confirmed to be an intentional
override). Persist-eligibility rule: `!asset.builtin || asset.manuallyPicked`.

## Requirements

### Functional — Data model (Prisma)

```prisma
model FixedAssetFile {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  assetKey  String
  filename  String
  origName  String

  @@unique([productId, assetKey])
}
```

Add to `Product`: `fixedAssetFiles FixedAssetFile[]`.

Migration name: `add_fixed_asset_file`. This is a pure addition (new
table + new relation array field) — no rename, no data migration
concerns, safe to generate normally.

### Functional — Types (`lib/types.ts`)

```ts
export interface FixedAssetFile {
  id: string
  assetKey: string
  filename: string
  origName: string
}
```

Add to `ProductConfig`: `fixedAssetFiles: FixedAssetFile[]`.

Add to `FixedAssetDef`: `manuallyPicked?: boolean`.

### Functional — Upload/download routes

`app/api/products/[name]/asset/route.ts` (new) — mirrors
`app/api/products/[name]/file/route.ts` exactly, with `'mascot-files'`
swapped for `'fixed-assets'` as the subfolder passed to
`userProductPath()`. Same auth check, same `x-filename` header read
through `sanitizeFilename()`, same raw-binary body write, same
`{ success: true }` / 400-on-exception response shape.

`app/api/products/[name]/asset/[filename]/route.ts` (new) — mirrors
`app/api/products/[name]/file/[filename]/route.ts` exactly, same
subfolder swap.

### Functional — `app/api/products/[name]/config/route.ts`

- `toConfig()`: add `fixedAssetFiles: p.fixedAssetFiles.map((f) => ({ id: f.id, assetKey: f.assetKey, filename: f.filename, origName: f.origName }))`.
- `GET`: change `include: { files: true }` → `include: { files: true, fixedAssetFiles: true }`.
- `POST`: read `const fixedAssetFiles = (body.fixedAssetFiles as Array<{ id?: string; assetKey: string; filename: string; origName: string }>) ?? []`. After the existing mascot-file delete+recreate block, add the same pattern:
  ```ts
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
  ```
  Change the final re-fetch's `include` to `{ files: true, fixedAssetFiles: true }` too.

### Functional — `app/app/factory/page.tsx`

1. Add a stored-filename helper mirroring `storedFilename(file: FileEntry)`:
   ```ts
   function storedAssetFilename(asset: FixedAssetDef) {
     return `${asset.id}${fileExtension(asset.blob!.name)}`
   }
   ```
   (Uses `asset.id` — i.e. the asset key — directly as the stable stored
   name, since each product has at most one file per asset key per the
   `@@unique([productId, assetKey])` constraint; no separate UUID needed
   the way `MascotFile` needs one per content file.)

2. `loadProduct()`: after the existing `mascotFiles` restoration block,
   add fixed-asset restoration. This must (a) set `manuallyPicked: true`
   on any restored override so it persists again on the next save without
   requiring the user to re-pick it, and (b) defensively synthesize a slot
   if the persisted `assetKey` isn't already present in `fixedAssets`
   (covers the template-driven custom-asset race, where the reconciliation
   effect may not have run yet):
   ```ts
   const restoredAssets = (await Promise.all(normalized.fixedAssetFiles.map(async (entry) => {
     const assetResponse = await fetch(`/api/products/${encodedName}/asset/${encodeURIComponent(entry.filename)}`)
     if (!assetResponse.ok) return null
     const blob = await assetResponse.blob()
     const file = new File([blob], entry.origName || entry.filename, { type: blob.type })
     return { assetKey: entry.assetKey, file }
   }))).filter((entry): entry is { assetKey: string; file: File } => entry !== null)

   setFixedAssets((current) => {
     const known = new Set(current.map((a) => a.id))
     const additions = restoredAssets
       .filter((r) => !known.has(r.assetKey))
       .map((r) => ({
         id: r.assetKey, label: r.assetKey, slot: null,
         zipName: `${sanitizeAssetFilename(r.assetKey)}.png`,
         builtin: false, accept: '*/*', blob: null,
       }))
     return [...current, ...additions].map((asset) => {
       const match = restoredAssets.find((r) => r.assetKey === asset.id)
       return match ? { ...asset, blob: match.file, manuallyPicked: true } : asset
     })
   })
   ```
   Place this after `setFiles(...)` in `loadProduct`, before `setDirty(false)`.

3. `saveProduct()`: after the existing mascot-file upload block, upload
   any persist-eligible fixed asset blobs and include their metadata in
   the config POST body:
   ```ts
   const persistableAssets = fixedAssets.filter((asset) => asset.blob && (!asset.builtin || asset.manuallyPicked))

   await Promise.all(persistableAssets.map(async (asset) => {
     const response = await fetch(`/api/products/${encodedName}/asset`, {
       method: 'POST',
       headers: { 'X-Filename': storedAssetFilename(asset) },
       body: asset.blob,
     })
     if (!response.ok) throw new Error(`Could not upload ${asset.label}`)
   }))

   const fixedAssetFiles = persistableAssets.map((asset) => ({
     assetKey: asset.id,
     filename: storedAssetFilename(asset),
     origName: asset.blob!.name,
   }))
   ```
   Add `fixedAssetFiles` to `nextConfig` (it's part of `ProductConfig` now)
   so it flows through the existing POST body construction unchanged.

4. `AssetSlot`'s file-pick handler in `components/FixedAssets.tsx` needs
   to set `manuallyPicked: true` alongside `blob`:
   ```ts
   const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0]
     if (file) onUpdate({ blob: file, manuallyPicked: true })
     event.target.value = ''
   }
   ```

## Architecture check
- New Prisma model + routes follow the exact same auth/ownership/
  path-guarding conventions as `MascotFile`'s routes — no new patterns
  introduced.
- No change to the unrelated, unauthenticated global `/api/slot/[name]`
  route (shop-wide defaults) — this is purely additive, per-product
  override persistence layered on top.

## Files to create
| Path | Purpose |
|---|---|
| `app/api/products/[name]/asset/route.ts` | POST upload, mirrors `file/route.ts` |
| `app/api/products/[name]/asset/[filename]/route.ts` | GET download, mirrors `file/[filename]/route.ts` |
| `prisma/migrations/<timestamp>_add_fixed_asset_file/migration.sql` | New table |

## Files to modify
| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add `FixedAssetFile` model + `Product.fixedAssetFiles` |
| `lib/types.ts` | Add `FixedAssetFile` type, `ProductConfig.fixedAssetFiles`, `FixedAssetDef.manuallyPicked` |
| `app/api/products/[name]/config/route.ts` | Read/write/include `fixedAssetFiles` |
| `app/app/factory/page.tsx` | `storedAssetFilename()`, restore-on-load, upload-on-save |
| `components/FixedAssets.tsx` | Set `manuallyPicked: true` on file pick |

## Out of Scope
- Ad-hoc custom assets added via "+ Add custom asset" (no stable slot
  identity to restore into — see Key design decision above).
- Any change to the global `/api/slot/[name]` shop-default route.
- Copying `fixedAssetFiles` when duplicating a product — handled in the
  separate `docs/collection-duplicate.md` spec, since it touches the same
  duplicate route this feature's sibling spec is also fixing.

## Tests (mandatory per project rule)
- `tests/integration/products-config.test.ts` (new — no existing test
  covers `config/route.ts` today, only `tests/integration/products.test.ts`
  which covers the top-level list/create route) — POST with a
  `fixedAssetFiles` array round-trips correctly; GET includes
  `fixedAssetFiles`; mock `prisma.fixedAssetFile` the same way
  `prisma.mascotFile` would be mocked.
- `tests/integration/products-asset.test.ts` (new — no existing test
  covers the mascot-file upload/download routes either, so this is a
  fresh pattern; mirror the auth-gate + `fs`-mocking convention already
  used in `tests/integration/products.test.ts`) — auth-gated
  upload/download for the new asset routes.
- E2E: extend an existing Factory-page test or add a lean one — pick a
  file for the thank-you card override, save, reload the page, confirm
  the picked file (not the shop default) is still shown.

## Verification
1. `npx prisma migrate dev --name add_fixed_asset_file` (or hand-write +
   `migrate deploy` the same way the Product Template migration was
   applied, if `migrate dev` isn't interactive-capable in this
   environment).
2. `npx tsc --noEmit`, `bun test tests/unit`, `bun test tests/integration`.
3. In the Factory page: pick a custom file for "Thank You card", save,
   reload the page (or switch products and back) — confirm the custom
   file persists, not the shop default.
4. Confirm a product that never touches the thank-you/how-to slots does
   NOT accumulate a `FixedAssetFile` row for them after saving (query the
   DB or check network requests — no POST to `/api/products/.../asset`
   should fire for untouched built-in slots).
5. Assign a template with a custom asset key, upload a file into that
   slot, save, reload — confirm it restores correctly.
