# Spec: "Other" custom asset type for loadouts

## Overview
Loadouts currently offer 4 fixed asset-type toggles (readme, license,
thankyou, howto). Add a 5th, open-ended "Other" flow: the user types their
own name and can add an unlimited number of custom-named entries per
loadout. Each custom entry becomes a real, uploadable file slot on the
Factory page's Fixed Assets section — not just a decorative checkbox.

## Follows the pattern of
- `components/FixedAssets.tsx`'s existing non-builtin asset slot (editable
  label input, upload button, remove button) — reused as-is, no new
  component needed. We just need matching `FixedAssetDef` entries with
  `builtin: false` to exist in state for it to render them.
- `components/FolderManager.tsx`'s folder chip pattern (`Badge
  variant="outline"` + inline `✕` remove button) — same shape for custom
  asset-type chips on the loadout manager page.
- `lib/utils.ts`'s existing small pure-function exports (`avatarColor`,
  `greeting`, `formatDate`, `tagKey`) — two new helpers follow this
  convention exactly, tested in `tests/unit/utils.test.ts`.

## Background (from exploration — do not re-derive, just use)
- `Loadout.assets` (`prisma/schema.prisma`) is a plain `String[]`. No
  enum/validation in `app/api/loadouts/route.ts` or
  `app/api/loadouts/[id]/route.ts` — arbitrary strings are safe to store.
  **No API or schema changes in this feature.**
- Of today's 4 keys, only `'thankyou'`/`'howto'` do anything — they gate
  `visibleFixedAssets = fixedAssets.filter(a => activeAssets.includes(a.id))`
  in `app/app/factory/page.tsx` (~line 305). `'readme'`/`'license'` are
  pure no-op decorative toggles used only by the loadout page's own
  `ASSET_TYPES` UI array — nothing else in the codebase reads them. Leave
  them untouched.
- **Pre-existing bug found during planning, fixed as part of this change**:
  `<FixedAssets assets={visibleFixedAssets} onChange={setFixedAssets} .../>`
  (factory/page.tsx ~line 395) passes the loadout-filtered subset as the
  `onChange` target. Any edit inside `FixedAssets` (upload, rename, remove)
  calls `onChange` with just that subset, and `setFixedAssets(subset)`
  **replaces the entire state**, silently dropping any assets hidden by the
  current loadout filter. Must be fixed via a proper merge (see below) —
  otherwise this bug gets much worse once loadouts carry arbitrary numbers
  of custom entries.
- `lib/zip.ts`'s `buildZip`/`buildZipTree` use `asset.zipName` verbatim as
  the ZIP file path (line 115: `zip.file(asset.zipName, ...)`) — no
  extension/collision handling. Synthesized custom assets need a unique,
  sanitized `zipName` per entry to avoid collisions.
- `buildZip`/`buildZipTree` are already called with the **full**
  `fixedAssets` array, not the filtered one (factory/page.tsx ~lines
  262, 273) — no changes needed there; newly synthesized + uploaded custom
  assets are automatically included once a blob is attached.

## Requirements

### Functional
1. On the loadout manager page (`app/app/fixed-assets/page.tsx`), below the
   existing 4-tile `ASSET_TYPES` grid, show the loadout's custom
   ("Other") entries as removable chips, plus an "+ Add other asset"
   input to add new ones. Unlimited custom entries per loadout.
2. Adding/removing a custom entry updates the same `editAssets` state the
   4 fixed tiles already use, via the *existing* `toggleAsset` function —
   do not write a parallel/duplicate state mechanism.
3. Validation on add: trim whitespace, reject empty, reject case-insensitive
   duplicates of any existing entry (built-in key or custom name already
   present in `editAssets`) — show an inline error message and don't clear
   the input in that case, so the user can adjust and resubmit.
4. On the Factory page (`app/app/factory/page.tsx`), when a loadout with
   custom entries is active, each custom entry must appear as its own
   editable/uploadable slot in the "4. Fixed Assets" section (reusing
   `components/FixedAssets.tsx` — no new component).
5. Fix the data-loss bug in the `<FixedAssets>` `onChange` wiring (see
   Background) so switching between loadouts never silently drops assets
   hidden by the previous/next loadout's filter.

### Non-functional
- Follows the shadcn/ui conventions already established across this
  codebase: `Button`, `Input`, `Badge` from `@/components/ui/*`, `cn()`
  from `@/lib/cn` for conditional classNames. Do not hand-roll raw
  Tailwind for new UI in this feature — this whole app was just migrated
  to shadcn/ui, stay consistent.
- No new component files — reuse `components/FixedAssets.tsx` as-is.
- Every new pure function needs a unit test (mandatory project rule).

## Architecture check
- Layer: presentation + light client-state logic only. No Prisma/API
  changes. `lib/utils.ts` stays a client-safe pure-function module (no
  `fs`/`db` imports — same constraint as its existing exports).
- Imports allowed: `app/app/fixed-assets/page.tsx` and
  `app/app/factory/page.tsx` may import from `@/components/ui/*`,
  `@/lib/utils`, `@/lib/cn`. `lib/utils.ts` itself imports nothing new.
- Imports forbidden: no new imports of `@/lib/db` or `@/auth` anywhere in
  this feature (no server-side changes).

## Implementation

### 1. `lib/utils.ts` — add two pure helpers
Add alongside the existing exports (don't touch `avatarColor`/`greeting`/
`formatDate`/`tagKey`):

```ts
// Collision-resistant, filename-safe key for a custom fixed-asset's zip entry
export function sanitizeAssetFilename(name: string): string {
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'CUSTOM'
}

// Merge a loadout-filtered "visible" subset's edits back into the full
// fixed-assets array without dropping items hidden by the filter.
export function mergeVisibleAssets<T extends { id: string }>(
  current: T[],
  updatedVisible: T[],
  visibleIds: Set<string>,
): T[] {
  const hidden = current.filter((item) => !visibleIds.has(item.id))
  return [...hidden, ...updatedVisible]
}
```

### 2. `app/app/fixed-assets/page.tsx` — "Other" UI
Read the current file in full before editing (it already uses shadcn
`Button`/`Card`/`Input`/`Label`/`Tabs` from the recent shadcn migration —
match that exact style). Changes:
- Add local state: `const [newAssetName, setNewAssetName] = useState('')`
  and `const [addError, setAddError] = useState('')`.
- Derive custom entries from the currently-editing loadout's assets:
  `const customAssetNames = editAssets.filter((key) => !ASSET_TYPES.some((a) => a.key === key))`.
- Add a handler:
  ```ts
  function addOtherAsset() {
    const trimmed = newAssetName.trim()
    if (!trimmed) return
    const isDuplicate = editAssets.some((key) => key.toLowerCase() === trimmed.toLowerCase())
    if (isDuplicate) {
      setAddError('Already added.')
      return
    }
    toggleAsset(trimmed)
    setNewAssetName('')
    setAddError('')
  }
  ```
- In the "Included assets" section, below the existing `grid grid-cols-2`
  of `ASSET_TYPES` buttons, add:
  - If `customAssetNames.length > 0`: a `flex flex-wrap gap-2` row of
    `Badge variant="outline"` chips, each showing the name plus a plain
    `✕` `<button>` (same micro-control precedent as `FolderManager.tsx`'s
    chip arrows — not wrapped in the `Button` component) that calls
    `toggleAsset(name)` to remove it.
  - Below that, an "+ Add other asset" row: an `Input` (placeholder
    "Custom asset name", value/onChange bound to `newAssetName`, submit on
    Enter via `onKeyDown`) + a `Button variant="outline"` labeled "Add"
    calling `addOtherAsset`. If `addError` is set, show it as a small
    `text-xs text-red-400` message below the input (same style as other
    inline errors in this codebase, e.g. `LicenseBanner.tsx`'s error `<p>`).

### 3. `app/app/factory/page.tsx` — wire custom entries to real file slots
Read the current file in full before editing. Changes:
- Import `sanitizeAssetFilename` and `mergeVisibleAssets` from `@/lib/utils`.
- Replace the inline `activeAssets` computation with a memoized version:
  ```ts
  const activeAssets = useMemo(() => (
    selectedLoadoutId
      ? (loadouts.find(l => l.id === selectedLoadoutId)?.assets ?? ['thankyou', 'howto'])
      : ['thankyou', 'howto']
  ), [selectedLoadoutId, loadouts])
  ```
  (add `useMemo` to the existing `react` import if not already imported —
  check first, this file already imports `useCallback`/`useEffect`/`useState`).
- Add a new `useEffect` (placed near the other asset-loading effects) that
  synthesizes missing custom `FixedAssetDef`s:
  ```ts
  const DECORATIVE_ASSET_KEYS = ['readme', 'license']

  useEffect(() => {
    setFixedAssets((current) => {
      const knownIds = new Set(current.map((a) => a.id))
      const missingKeys = activeAssets.filter(
        (key) => !DECORATIVE_ASSET_KEYS.includes(key) && !knownIds.has(key)
      )
      if (missingKeys.length === 0) return current
      return [
        ...current,
        ...missingKeys.map((key) => ({
          id: key,
          label: key,
          slot: null,
          zipName: `${sanitizeAssetFilename(key)}.png`,
          builtin: false,
          accept: '*/*',
          blob: null,
        })),
      ]
    })
  }, [activeAssets])
  ```
  Place `DECORATIVE_ASSET_KEYS` as a module-level constant near
  `INITIAL_FIXED_ASSETS`, not inside the component.
- Fix the `<FixedAssets>` usage:
  ```tsx
  <FixedAssets
    assets={visibleFixedAssets}
    onChange={(updatedVisible) =>
      setFixedAssets((current) =>
        mergeVisibleAssets(current, updatedVisible, new Set(visibleFixedAssets.map((a) => a.id)))
      )
    }
    onAddCustom={addCustomAsset}
  />
  ```
- Do not touch `buildZip`/`buildZipTree` call sites — they already use the
  full `fixedAssets` array.

## Files Summary
| Action | Path | Blueprint |
|--------|------|-----------|
| MODIFY | `lib/utils.ts` | existing exports in same file |
| MODIFY | `app/app/fixed-assets/page.tsx` | `components/FolderManager.tsx` chip pattern |
| MODIFY | `app/app/factory/page.tsx` | — |
| MODIFY (new tests) | `tests/unit/utils.test.ts` | existing test blocks in same file |
| CREATE | `tests/e2e/fixed-assets.spec.ts` | `tests/e2e/dashboard.spec.ts` (dev-bypass pattern) |

## Out of Scope
- No changes to `'readme'`/`'license'` decorative-toggle behavior.
- No backend persistence for custom fixed-asset files (matches existing
  `addCustomAsset` behavior — session-only, bundled directly into the ZIP
  on download, never uploaded to a server-side slot).
- No changes to `lib/zip.ts` itself.

## Verification
1. `npx tsc --noEmit`, `bun test tests/unit`, `bun x playwright test tests/e2e/fixed-assets.spec.ts`.
2. `npm run dev` → dev-bypass login → `/app/fixed-assets`: create a
   loadout, add 2-3 custom "Other" entries with different names, save.
3. `/app/factory`: select a product using that loadout — confirm each
   custom entry appears as its own editable/uploadable slot in section 4,
   upload a small file to one, switch to a different loadout and back —
   confirm the uploaded custom asset and `thankyou`/`howto` are NOT
   silently dropped (this is the regression check for the bug fix).
