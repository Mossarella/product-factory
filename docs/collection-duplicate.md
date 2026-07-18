# Spec: Duplicate Product from Collection

## Overview
Adds a "Duplicate" action to the Collection page's detail panel, reusing
the existing `/api/products/[name]/duplicate` route (today only reachable
from the Factory page). Along the way, fixes two real bugs discovered in
that route: it doesn't copy `templateId` (a duplicated product silently
loses its assigned Product Template) and — once
`docs/fixed-asset-persistence.md` lands — it wouldn't copy
`fixedAssetFiles` either, since both were added to `Product` after this
route was originally written.

## Follows the pattern of
- `components/ProductSelector.tsx` — the existing duplicate/rename UX:
  **not** a dialog, **not** `window.prompt()` — a plain inline toggled
  `<form>` with an `<Input autoFocus required>` and Confirm/Cancel
  buttons, shown beneath a row of trigger buttons. `components/ui/dialog.tsx`
  exists but is unused anywhere in this codebase — do not introduce it
  here; match the established pattern instead.
- `app/app/factory/page.tsx`'s `duplicateProduct()` and `refreshProducts`
  — blueprint for the fetch call and the re-fetch-after-mutation pattern
  Collection currently lacks.
- `app/app/collection/page.tsx`'s detail-panel header (the "Open in
  Factory →" link) — the exact insertion point for the new "Duplicate"
  trigger button, same row, same `buttonVariants({ variant: 'secondary' })`
  styling.

## Requirements

### Functional — Bug fixes in `app/api/products/[name]/duplicate/route.ts`
This route has its own separate, drifted `toConfig()` and hand-written
`prisma.product.create` call (not shared with `config/route.ts`) — it
currently omits `templateId` entirely from both:
- Add `templateId: p.templateId ?? null` to this route's `toConfig()`.
- Add `templateId: source.templateId` to the `prisma.product.create({data: {...}})` block, copying the source product's assigned template.
- Add a `fixedAssetFiles` array to `toConfig()` (mirroring the `mascotFiles` mapping) and a nested `fixedAssetFiles: { create: source.fixedAssetFiles.map((f) => ({ assetKey: f.assetKey, filename: f.filename, origName: f.origName })) }` block in the `create` call — mirroring exactly how `files: { create: source.files.map(...) }` already copies `MascotFile` rows. **This part only applies once `docs/fixed-asset-persistence.md` has landed** (the `FixedAssetFile` model must exist first) — sequence this spec's implementation after that one, or after confirming the model exists.
- The route's `include: { files: true }` (both on the initial `source` lookup and the final `duplicate` create) needs `fixedAssetFiles: true` added alongside `files: true` for the same reason.
- Note: the on-disk file bytes for both `mascot-files/` and (once it
  exists) `fixed-assets/` subfolders are already copied for free by the
  existing `fs.cpSync(srcDir, destDir, { recursive: true })` — only the DB
  metadata rows need an explicit copy, same as `files` already gets.

### Functional — Collection page (`app/app/collection/page.tsx`)

1. Add a `refreshProducts` function mirroring the Factory page's:
   ```ts
   const refreshProducts = useCallback(async () => {
     const response = await fetch('/api/products')
     if (response.ok) setProducts(await response.json() as ProductSummary[])
   }, [])
   ```
   Use it in the initial `useEffect` (replacing the inline
   `fetch('/api/products').then(...)`) and call it again after a
   successful duplicate.

2. New state: `duplicating: boolean` (form open/closed), `duplicateName: string`, `isSubmittingDuplicate: boolean`, `duplicateError: string | null`.

3. New handler:
   ```ts
   async function duplicateProduct() {
     if (!selectedName) return
     const trimmed = duplicateName.trim()
     if (!trimmed) return
     setIsSubmittingDuplicate(true)
     setDuplicateError(null)
     try {
       const response = await fetch(`/api/products/${encodeURIComponent(selectedName)}/duplicate`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ newName: trimmed }),
       })
       if (!response.ok) {
         const body = await response.json().catch(() => ({}))
         setDuplicateError(body.error || 'Could not duplicate product')
         return
       }
       const duplicated: ProductConfig = await response.json()
       await refreshProducts()
       setDetailCache((previous) => ({ ...previous, [duplicated.name]: duplicated }))
       setSelectedName(duplicated.name)
       setDuplicating(false)
       setDuplicateName('')
     } catch {
       setDuplicateError('Could not duplicate product')
     } finally {
       setIsSubmittingDuplicate(false)
     }
   }
   ```
   This deliberately adds inline error handling that the source pattern
   (`ProductSelector`) lacks — a reasonable, small improvement scoped only
   to this new addition, not a retrofit of the existing Factory-page flow.

4. UI — in the detail panel header (right next to the existing "Open in
   Factory →" link), add a "Duplicate" button and, when `duplicating` is
   true, an inline form beneath the header row (same toggle-form shape as
   `ProductSelector`, adapted to this page's existing styling
   conventions):
   ```tsx
   <div className="flex items-start justify-between mb-1">
     <div>
       <h2 ...>{detail.productName || detail.name}</h2>
       <p ...>...</p>
     </div>
     <div className="flex gap-2 shrink-0 ml-4">
       <Button
         variant="outline"
         className="h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors"
         onClick={() => { setDuplicating((v) => !v); setDuplicateName(''); setDuplicateError(null) }}
       >
         Duplicate
       </Button>
       <a href="/app/factory" className={cn(buttonVariants({ variant: 'secondary' }), 'h-auto rounded-none px-4 py-1.5 text-xs font-mono transition-colors')}>
         Open in Factory →
       </a>
     </div>
   </div>
   {duplicating && (
     <form
       onSubmit={(event) => { event.preventDefault(); void duplicateProduct() }}
       className="flex items-center gap-2 mb-4"
     >
       <Input
         autoFocus
         required
         placeholder="New product name"
         value={duplicateName}
         onChange={(event) => setDuplicateName(event.target.value)}
         className="h-auto w-56 rounded-none border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-300"
       />
       <Button type="submit" variant="default" disabled={isSubmittingDuplicate} className="h-auto rounded-none px-3 py-1.5 text-xs font-mono">
         {isSubmittingDuplicate ? 'Working…' : 'Confirm'}
       </Button>
       <Button type="button" variant="outline" onClick={() => setDuplicating(false)} className="h-auto rounded-none px-3 py-1.5 text-xs font-mono">
         Cancel
       </Button>
       {duplicateError && <p className="text-xs text-red-400">{duplicateError}</p>}
     </form>
   )}
   ```
   Import `Button` from `@/components/ui/button` (not currently imported
   in this file — check and add) and `useCallback` from React (already
   likely imported alongside `useState`/`useEffect` — check and extend the
   existing React import).

## Architecture check
- No new API route — reuses the existing duplicate route (with the two
  bug fixes above).
- Collection page stays a client component; no new server-side data
  fetching pattern introduced.

## Files to modify
| Path | Change |
|---|---|
| `app/api/products/[name]/duplicate/route.ts` | Add `templateId` + `fixedAssetFiles` copying (the latter only after the fixed-asset-persistence spec lands) |
| `app/app/collection/page.tsx` | `refreshProducts`, duplicate state/handler, Duplicate button + inline form |

## Out of Scope
- Any change to `ProductSelector.tsx`/the Factory page's existing
  duplicate/rename flow (untouched, working as-is).
- A "rename from Collection" equivalent (not requested — duplicate only).
- Introducing `components/ui/dialog.tsx` anywhere (stays unused, matching
  the existing codebase-wide pattern).

## Tests (mandatory per project rule)
- `tests/integration/products-duplicate.test.ts` (new, or extend if a
  duplicate-route test already exists — check first) — cover the
  `templateId` copy and (once available) the `fixedAssetFiles` copy in
  the response body and in the mocked `prisma.product.create` call's
  `data` argument.
- E2E: extend an existing Collection-page spec or add a lean one —
  select a product, click Duplicate, enter a name, confirm the new
  product appears in the grid and is selected in the detail panel.

## Verification
1. `npx tsc --noEmit`, `bun test tests/unit`, `bun test tests/integration`.
2. Assign a Product Template to a product in the Factory page, save.
   Duplicate it from Collection — confirm the duplicate's detail panel
   shows the same Product Template assigned (not "— None").
3. Confirm the duplicate's on-disk directory contains the same
   `mascot-files/` (and, once available, `fixed-assets/`) contents as the
   source.
4. Trigger a duplicate with a name that already exists — confirm the
   inline error message renders instead of an uncaught exception.
