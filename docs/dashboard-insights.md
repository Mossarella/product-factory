# Spec: Dashboard Insights Panel

## Goal
Add an "Insights" section below the existing stats grid on `app/app/dashboard/page.tsx`.

---

## New insight cards to implement

### 1. This Month
- Count of products where `createdAt >= first day of current month`
- Label: `This Month`
- Value: number + "products"
- Color: `text-zinc-100`

### 2. Products without GIF preview
- Join `MascotFile` records: count distinct products where NO file has `origName` ending in `.gif` (case-insensitive)
- Label: `No GIF Preview`
- Value: number + "products"
- Color: `text-amber-400` if > 0, else `text-zinc-500`
- Sub-label: "products don't contain a GIF preview"

### 3. Products sharing identical tags
- Group products by their `etsyTags` array (sort tags before comparing, join to string as key)
- A product "shares identical tags" if at least one other product has the exact same tag set
- Count how many products fall into these duplicate-tag groups
- Label: `Identical Tags`
- Value: number + "products"
- Color: `text-amber-400` if > 0, else `text-zinc-500`
- Sub-label: "products share identical tag sets"

### Commented-out stubs (add as `{/* TODO ... */}` comments, not rendered)
- Average Export Time — TODO: needs explicit export tracking
- README reused — TODO: needs fixed asset system (readme, thank you card, contact)
- Shared Assets Saved — TODO: needs asset reuse tracking

---

## Implementation

Modify `app/app/dashboard/page.tsx` only.

Add the insight data computation inside the existing `DashboardPage` server component, after the existing stats computation:

```ts
// --- Insights ---
const now = new Date()
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

// This Month
const thisMonth = products.filter(p => {
  // products already fetched above — but we need createdAt
  // fetch separately below
}).length
```

IMPORTANT: The current Prisma query in `DashboardPage` does NOT select `createdAt` or `etsyTags`. You must update the `prisma.product.findMany` select to also include `createdAt`, `etsyTags`, and nest `files` to include `origName`:

```ts
const products = await prisma.product.findMany({
  where: { userId },
  select: {
    name: true,
    complete: true,
    description: true,
    etsyTitle: true,
    etsyTags: true,
    createdAt: true,
    files: { select: { id: true, origName: true } },
  },
})
```

Then compute:

```ts
const now = new Date()
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
const thisMonth = products.filter(p => new Date(p.createdAt) >= firstOfMonth).length

const noGifPreview = products.filter(p =>
  !p.files.some(f => f.origName.toLowerCase().endsWith('.gif'))
).length

// Products sharing identical tag sets
const tagKey = (tags: string[]) => [...tags].sort().join('|')
const tagGroups: Record<string, number> = {}
for (const p of products) {
  const key = tagKey(p.etsyTags)
  tagGroups[key] = (tagGroups[key] ?? 0) + 1
}
const sharedTags = products.filter(p => (tagGroups[tagKey(p.etsyTags)] ?? 1) > 1).length
```

---

## UI

Add a second section below the existing stats grid:

```tsx
{/* Insights */}
<div className="mt-10">
  <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-4">Insights — This Month</p>
  <div className="grid grid-cols-3 gap-4">
    <div className="border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">This Month</p>
      <p className="text-4xl font-bold font-mono text-zinc-100">{thisMonth}</p>
      <p className="text-xs text-zinc-600 font-mono mt-2">products created</p>
    </div>

    <div className="border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">No GIF Preview</p>
      <p className={`text-4xl font-bold font-mono ${noGifPreview > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
        {noGifPreview}
      </p>
      <p className="text-xs text-zinc-600 font-mono mt-2">products don&apos;t contain a GIF preview</p>
    </div>

    <div className="border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Identical Tags</p>
      <p className={`text-4xl font-bold font-mono ${sharedTags > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
        {sharedTags}
      </p>
      <p className="text-xs text-zinc-600 font-mono mt-2">products share identical tag sets</p>
    </div>

    {/*
      TODO: Average Export Time — needs explicit export event tracking
      TODO: README reused — needs fixed asset system (readme, thank you card, contact)
      TODO: Shared Assets Saved — needs asset reuse tracking
    */}
  </div>
</div>
```

---

## Constraints
- Only modify `app/app/dashboard/page.tsx`
- Do not touch any other file
- Keep all existing stats grid and greeting unchanged
- No new npm packages
