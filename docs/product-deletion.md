# Spec: Product deletion

## Overview
There is currently no way to delete a product — no API route, no UI. Item
3 of the SaaS-readiness roadmap. Add a `DELETE` route plus a destructive
confirmation flow in both places a product is managed (Collection page,
Factory page).

## Follows the pattern of
- `app/api/products/[name]/duplicate/route.ts` — auth check, ownership
  lookup via the `userId_name` composite unique key, sequential (not
  transactional) Prisma + object-storage calls.
- `app/app/collection/page.tsx`'s `duplicateProduct()` + inline-form UI —
  blueprint for the Collection page's action, adapted to use a `Dialog`
  instead of an inline form (this action is irreversible, unlike
  duplicate/rename).
- `components/ProductSelector.tsx` — blueprint for the Factory page's
  action; gets a new `onDelete` prop alongside `onRename`/`onDuplicate`.
- `tests/integration/products-duplicate.test.ts` — blueprint for the new
  integration test's mock shape (auth, `@/lib/db`, `@/lib/object-storage`).

## Investigation findings
- **DB side is already safe.** `MascotFile`, `FixedAssetFile`, and
  `ProductBuild` all have `onDelete: Cascade` back to `Product` in
  `prisma/schema.prisma` — a plain `prisma.product.delete(...)` cleanly
  removes all child rows. `ProductTemplate` is the other relation
  direction (`SetNull`) and is untouched by deleting a Product.
- **Object storage is not cascade-safe.** All product files live in MinIO
  under `products/{productId}/...` (`lib/object-storage.ts`'s
  `productKey()`). There is no bulk-delete helper today — only
  `deleteObject(key)` (single key) and `copyObjectsByPrefix(src, dest)`
  (list + copy, used by duplicate). Deleting only the DB row would orphan
  every object in MinIO forever. **New helper needed:**
  `deleteObjectsByPrefix(prefix)` in `lib/object-storage.ts`, mirroring
  `copyObjectsByPrefix`'s `ListObjectsV2Command` pagination loop but
  issuing `DeleteObjectCommand` per listed key instead of `CopyObjectCommand`.
- **No existing destructive-confirmation UI pattern.** Duplicate/rename
  use an inline form with no confirmation step (fine for non-destructive
  actions). `components/ui/dialog.tsx` (full shadcn-style Dialog built on
  `@base-ui/react/dialog`) exists and is unused for this — it's the
  building block for a real "Delete product?" modal. `buttonVariants`
  already has a `destructive` variant (`components/ui/button.tsx`) that
  nothing currently renders.
- Sequencing: delete object storage first, then the DB row (matches "if a
  step fails, prefer to have failed before committing the point of no
  return" — an orphaned object-storage prefix with no DB row is a leaked
  file, recoverable by manual cleanup; a deleted DB row with leftover
  files reachable through it is the worse outcome. Either ordering can
  produce a partial failure, so pick the direction whose failure mode is
  quieter: storage-fails-first cancels the whole operation and the
  product still shows up dutifully in the UI for a retry, vs.
  DB-fails-first would prevent the storage prefix delete from ever running
  since the response returns as an error but the row is still there — so
  practically DB-succeeds-then-storage-fails is the one real risk either
  way. Given cascade delete is a single fast DB operation with no expected
  failure mode besides connection loss, do object storage cleanup *first*,
  then the DB delete — if the DB delete throws after storage is gone,
  that's the same "leaked reference to nothing" state minus files, no
  worse than today.

## Requirements

### API: `DELETE /api/products/[name]`
New file `app/api/products/[name]/route.ts` (this path is currently free —
no file exists there at all).
- `auth()` check → 401 if unauthenticated.
- Look up via `prisma.product.findUnique({ where: { userId_name: { userId, name } } })` → 404 if not found (same ownership-scoped pattern as duplicate/rename — no separate userId check needed elsewhere).
- Call `deleteObjectsByPrefix(productKey(product.id) + '/')`.
- Call `prisma.product.delete({ where: { id: product.id } })`.
- Return `NextResponse.json({ ok: true })`, `200`.

### `lib/object-storage.ts`: add `deleteObjectsByPrefix`
```ts
export async function deleteObjectsByPrefix(prefix: string): Promise<void> {
  let continuationToken: string | undefined
  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const object of listed.Contents ?? []) {
      if (!object.Key) continue
      await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: object.Key }))
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)
}
```
Same pagination shape as `copyObjectsByPrefix`, swapping the per-object
action from copy to delete. No new imports needed (`DeleteObjectCommand`
and `ListObjectsV2Command` are already imported in this file).

### UI: Collection page (`app/app/collection/page.tsx`)
- Add `deleteDialogOpen`/`isDeleting`/`deleteError` state, alongside the
  existing `duplicating`/`isSubmittingDuplicate`/`duplicateError` state.
- Add a `deleteProduct()` async function mirroring `duplicateProduct()`'s
  shape: `fetch(DELETE)` → on success, remove the product from `products`,
  drop it from `detailCache`, clear `selectedName`, close the dialog; on
  failure, set `deleteError` and keep the dialog open.
- Add a `destructive`-variant "Delete" button in the detail header's
  button row (next to Duplicate), wrapped in a `Dialog`/`DialogTrigger`.
  `DialogContent` shows `DialogTitle` ("Delete {detail.productName ||
  detail.name}?"), `DialogDescription` warning this permanently deletes
  the product and all its files, and a `DialogFooter` with a `Cancel`
  (`DialogClose`) and a destructive `Confirm delete` button that calls
  `deleteProduct()` (disabled + "Deleting…" while `isDeleting`).

### UI: Factory page (`app/app/factory/page.tsx` + `components/ProductSelector.tsx`)
- `ProductSelector` gets a new required prop `onDelete: () => Promise<void>`
  (no name argument needed — always the active product, unlike
  create/rename/duplicate which take a new name).
- Add a destructive "Delete" button next to the existing Rename/Duplicate
  buttons, `disabled={!activeProduct}`, wrapped in the same `Dialog`
  confirmation pattern as Collection (title/description/footer as above,
  referencing `activeProduct` for the name).
- In `app/app/factory/page.tsx`, add a `deleteProduct` handler mirroring
  `duplicateProduct`'s shape but calling `DELETE` and, on success: clear
  `activeProduct`/`config`/`files` back to the empty state (mirror what
  happens when there's no active product — check how the page renders
  with `activeProduct === null` today, likely just don't call
  `loadProduct` and instead reset local state directly), then
  `await refreshProducts()`.
- Wire `onDelete={deleteProduct}` into the `<ProductSelector>` call site.

## Architecture check
- No new layers — this stays within the existing route/page/component
  structure. `deleteObjectsByPrefix` lives in the same `lib/object-storage.ts`
  as its sibling `copyObjectsByPrefix`.

## Tests (mandatory — unit N/A here, integration + E2E)
### `tests/integration/products-delete.test.ts` (new)
Blueprint: `tests/integration/products-duplicate.test.ts`'s mock shape
(auth session mock, `@/lib/db` mock with `findUnique`/`delete`,
`@/lib/object-storage` mock adding a `mockDeleteObjectsByPrefix = mock(() => Promise.resolve())`).
Cases:
- 401 when unauthenticated.
- 404 when the product doesn't exist (ownership-scoped lookup returns null).
- 200 on success: asserts `mockDeleteObjectsByPrefix` called with
  `productKey(product.id) + '/'`, asserts `mockDelete` called with
  `{ where: { id: product.id } }`, asserts response body `{ ok: true }`.

### `tests/unit/object-storage` — N/A
`lib/object-storage.ts` has no existing unit test file (it's an S3 client
wrapper exercised only through integration mocks elsewhere) — not adding
one now, consistent with how `copyObjectsByPrefix` itself has no direct
unit test either, only integration coverage through the duplicate route.

### `tests/e2e/delete-product.spec.ts` (new)
Blueprint: existing Playwright specs in `tests/e2e/`. Flow: sign in (dev
bypass), create a product, navigate to Collection (or stay in Factory),
trigger delete, confirm in the dialog, assert the product no longer
appears in the product list/selector.

## Out of Scope
- Bulk/multi-select delete.
- A "trash"/soft-delete + restore window — this is a hard, immediate delete.
- Deleting a product that's currently open in another browser tab/session
  gracefully (no realtime sync in this app today; out of scope).

## Verification
1. `npm run dev`, sign in via dev bypass.
2. Create a product in Factory, upload a file, save, build a version.
3. In Collection, select it, click Delete, confirm — product disappears
   from the grid, detail panel clears.
4. In Factory, create another product, click Delete from the selector,
   confirm — `activeProduct` clears, selector no longer lists it.
5. Confirm in MinIO (or via `mc ls`/console) that `products/{id}/` is
   gone after deletion, not just the DB row.
6. `bun test tests/integration/products-delete.test.ts` passes.
7. `bun x playwright test tests/e2e/delete-product.spec.ts` passes.
