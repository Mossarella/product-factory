# Batch 2B — ProductSelector, ProductInfo, FolderManager, FixedAssets

Read `docs/v2-conventions.md` first.
Working directory: `/Users/Noppheera.Bha/Desktop/Work/product-factory`

## Shared types (put in `lib/types.ts`, import from there)

```ts
export interface ProductSummary {
  name: string
  complete: boolean
  createdAt: string
}

export interface MascotFile {
  id: string
  filename: string
  origName: string
  folder: string
  variant: string
}

export interface ProductConfig {
  name: string
  sku: string
  productName: string
  etsyTitle: string
  description: string
  notes: string
  contact: string
  price: number
  currency: string
  licenseType: 'personal' | 'commercial' | 'both'
  commercialPrice?: number
  folders: string[]
  mascotFiles: MascotFile[]
  etsyTags: string[]
  complete: boolean
  createdAt: string
}

export interface FixedAssetDef {
  id: string
  label: string
  slot: string | null    // null = no auto-load from server
  zipName: string
  builtin: boolean
  optional?: boolean
  accept?: string
  blob: File | null
}
```

---

## `components/ProductSelector.tsx`
`'use client'`

Props:
```ts
interface Props {
  products: ProductSummary[]
  activeProduct: string | null
  onSelect: (name: string) => void
  onCreate: (name: string) => Promise<void>
  onRename: (newName: string) => Promise<void>
  onDuplicate: (newName: string) => Promise<void>
  canCreate: boolean  // false if free plan limit reached
  onUpgradeClick: () => void
}
```

UI (monospace dark theme, Tailwind only):
- Dropdown `<select>` listing products with `✓` or `○` prefix + createdAt date
- "+ New" button — shows inline input to type name, Enter/button to confirm
- If `canCreate === false`: "+ New" button is disabled, shows tooltip "Free plan: 3 products max"
- Rename / Duplicate buttons (inline inputs, same pattern as v1)
- "Save product •" button (green when dirty, regular when clean) — calls onSave prop
- "⬇ Download ZIP" button (primary violet)
- "Preview ZIP" button

Include these action buttons as part of this component since they're tightly coupled with product state:
```ts
// additional props
  dirty: boolean
  onSave: () => Promise<void>
  onDownloadZip: () => void
  onToggleZipPreview: () => void
  zipPreviewText: string | null  // null = hidden
```

Style reference — mirror v1's compact monospace aesthetic in Tailwind:
- Section wrapper: `border border-zinc-800 bg-zinc-950 p-4`
- Buttons: `px-3 py-1.5 text-sm font-mono border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300`
- Primary button: `bg-violet-900 border-violet-700 text-violet-200 hover:bg-violet-800`
- Save (dirty): `bg-emerald-950 border-emerald-700 text-emerald-400 hover:bg-emerald-900`
- Danger: `bg-red-950 border-red-800 text-red-400`

---

## `components/ProductInfo.tsx`
`'use client'`

Props:
```ts
interface Props {
  config: ProductConfig
  onChange: (updates: Partial<ProductConfig>) => void
}
```

Sections (all in a `border border-zinc-800 p-4` container):
1. **Row 1**: SKU input + Contact input (flex gap-2)
2. **Row 2**: Product Name input + Etsy Title input (flex gap-2)
   - Etsy Title: live character counter `XX / 140` below the input
   - Counter color: text-zinc-500 → text-yellow-500 at 120 → text-red-500 at 140
3. **Description** textarea (min-h-[72px])
4. **Extra README notes** textarea
5. **Pricing row**: Price `$` input (number, step 0.01) + Currency select (USD only for now) + License select (Personal / Commercial / Both)
   - If "Both": show second price input for Commercial Price

All inputs call `onChange({ field: value })` on input.
Labels: small, text-zinc-500, uppercase tracking-wide, 0.75rem equivalent.

---

## `components/FolderManager.tsx`
`'use client'`

Replaces v1's Expression States section.
User defines arbitrary folder names. Default is `['Main']`.

Props:
```ts
interface Props {
  folders: string[]
  onChange: (folders: string[]) => void
}
```

UI:
- Show each folder as a tag chip: folder name + up/down reorder arrows + ✕ remove button
- "Main" folder cannot be removed (show it as built-in, no ✕)
- Add folder: text input + "Add" button (Enter key too)
- New folder name: capitalize first letter on input
- Validation: no duplicates, trim whitespace

Chip style: `inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono border border-zinc-700 bg-zinc-900 text-zinc-300`
Reorder buttons: tiny `▲` `▼` text buttons, `text-zinc-600 hover:text-zinc-300`
Remove `✕`: `text-red-800 hover:text-red-500 cursor-pointer`

---

## `components/FixedAssets.tsx`
`'use client'`

Props:
```ts
interface Props {
  assets: FixedAssetDef[]
  onChange: (assets: FixedAssetDef[]) => void
  onAddCustom: () => void
}
```

UI:
- Grid of asset slots (flex-col gap-2)
- Each slot: `flex gap-3 items-start border border-zinc-800 bg-zinc-900/50 p-3`
- Left: thumbnail (72×72) — shows blob URL if loaded, else `?` placeholder
- Right: label (built-in: fixed text; custom: editable input), status text (✓ loaded / — not loaded), "Pick file" button
- Optional assets (blob=null): greyed status, no error
- Custom slots: editable label + ✕ remove button
- "Pick file" opens `<input type="file">` with correct accept type

Built-in IDs: `thankyou` (auto-loaded from `/api/slot/thank-you-image`), `howto` (auto-loaded from `/api/slot/how-to-use`)
The parent component handles auto-loading on mount; this component just renders what it receives.

Print `=== COMPLETE: batch-2b-core-components ===` when done.
