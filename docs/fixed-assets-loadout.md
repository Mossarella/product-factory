# Spec: Fixed Asset Loadouts

## Overview
Users create named loadouts (e.g. "Coloring Book", "Photobook") that define which fixed asset
types are bundled with a product. In the factory, a product gets a loadout dropdown. Only assets
in the selected loadout are shown/included in that product.

---

## Asset types (hardcoded, extensible later)

| key | label | description |
|---|---|---|
| `readme` | README | Text file with product info |
| `license` | License | License agreement (personal/commercial) |
| `thankyou` | Thank You Card | Image file (THANKYOU.png) |
| `howto` | How To Use | Image file (HOWTO.png) |

---

## Data model changes

### 1. `prisma/schema.prisma` — add Loadout model + loadoutId on Product

Add after the existing Product model:

```prisma
model Loadout {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  assets    String[]  // array of asset keys: 'readme', 'license', 'thankyou', 'howto'
  createdAt DateTime  @default(now())
  products  Product[]

  @@index([userId])
}
```

Add to `User` model relation list: `loadouts Loadout[]`

Add to `Product` model:
```prisma
  loadoutId String?
  loadout   Loadout? @relation(fields: [loadoutId], references: [id], onDelete: SetNull)
```

---

## API routes

### `app/api/loadouts/route.ts` — GET list, POST create

```ts
GET  /api/loadouts        → { id, name, assets }[]  (user's loadouts, ordered by createdAt)
POST /api/loadouts        body: { name: string, assets: string[] }  → created loadout
```

Both require `auth()`. Scope by `session.user.id`.

### `app/api/loadouts/[id]/route.ts` — GET, PUT, DELETE

```ts
GET    /api/loadouts/:id  → { id, name, assets }
PUT    /api/loadouts/:id  body: { name?: string, assets?: string[] }  → updated loadout
DELETE /api/loadouts/:id  → 204
```

All require auth + ownership check (`loadout.userId === session.user.id`).

---

## New page: `app/app/fixed-assets/page.tsx`

Client component (`'use client'`). Route: `/app/fixed-assets`.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Fixed Asset Loadouts                                   │
│  Preset bundles of files attached to each product.     │
├────────────────┬────────────────────────────────────────┤
│  + New Loadout │  [selected loadout name — editable]    │
│  ──────────    │  ─────────────────────────────────     │
│  Coloring Book │  Asset grid (2×2):                     │
│  Photobook     │  ┌─────────┐ ┌─────────┐              │
│  Sticker Pack  │  │ README  │ │ LICENSE │              │
│                │  │  (off)  │ │  (on)   │              │
│                │  └─────────┘ └─────────┘              │
│                │  ┌─────────┐ ┌─────────┐              │
│                │  │THANK YOU│ │  HOW TO │              │
│                │  │  (on)   │ │  (off)  │              │
│                │  └─────────┘ └─────────┘              │
│                │                                        │
│                │  [Save changes]   [Delete loadout]     │
└────────────────┴────────────────────────────────────────┘
```

### Behaviour
- Left panel: list of loadouts. Click to select. "New Loadout" button creates one named "Untitled" with all assets off.
- Right panel: editable name field at top. Grid of 4 asset cards — click to toggle on/off.
  - ON state: `border-violet-500 bg-violet-500/10 text-violet-300`
  - OFF state: `border-zinc-700 bg-zinc-900 text-zinc-500`
- "Save changes" calls PUT `/api/loadouts/:id` with current name + assets.
- "Delete loadout" calls DELETE `/api/loadouts/:id`, removes from list, clears selection.
- If no loadouts exist, show empty state: "No loadouts yet. Create one to get started."

### Asset card design
Each card: `border p-4 cursor-pointer transition-colors select-none`
- Top: 24×24 icon (inline SVG)
- Middle: label (bold)
- Bottom: short description (muted)

Icons (inline SVG, 24×24, `currentColor`):
- README: document lines icon
- License: shield icon
- Thank You: heart icon
- How To: question-mark circle icon

---

## Sidebar update: `components/Sidebar.tsx`

Add a third nav item to the `NAV` array:

```ts
{
  href: '/app/fixed-assets',
  label: 'Fixed Assets',
  icon: <svg ...>  // stack-of-layers icon (3 horizontal lines stacked with offset)
},
```

Stack/layers icon (24×24):
```svg
<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M8 1L14 4L8 7L2 4L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  <path d="M2 8L8 11L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  <path d="M2 12L8 15L14 12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
</svg>
```

---

## Factory integration: `app/app/factory/page.tsx`

### State additions
```ts
const [loadouts, setLoadouts] = useState<{ id: string; name: string; assets: string[] }[]>([])
const [selectedLoadoutId, setSelectedLoadoutId] = useState<string | null>(null)
```

### Load loadouts on mount (alongside product load)
```ts
useEffect(() => {
  fetch('/api/loadouts').then(r => r.json()).then(setLoadouts)
}, [])
```

Also load saved loadoutId from product config when a product is loaded:
```ts
setSelectedLoadoutId(config.loadoutId ?? null)
```

### Save loadoutId when saving product
Include `loadoutId: selectedLoadoutId` in the POST body to `/api/products/:name/config`.

### Loadout dropdown UI
Add a "Loadout" row in the `ProductInfo` section (or just above it, in the factory header area), styled consistently with the rest of the factory:

```tsx
<div className="flex items-center gap-3 mb-4">
  <label className="text-xs uppercase tracking-widest text-zinc-600 font-mono w-28 shrink-0">Loadout</label>
  <select
    value={selectedLoadoutId ?? ''}
    onChange={e => setSelectedLoadoutId(e.target.value || null)}
    className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 font-mono focus:border-violet-500 focus:outline-none"
  >
    <option value="">— None —</option>
    {loadouts.map(l => (
      <option key={l.id} value={l.id}>{l.name}</option>
    ))}
  </select>
  <a href="/app/fixed-assets" className="text-xs text-zinc-600 hover:text-zinc-400 font-mono transition-colors">
    Manage →
  </a>
</div>
```

### FixedAssets filtering
Derive active asset keys from selected loadout:
```ts
const activeAssets = selectedLoadoutId
  ? (loadouts.find(l => l.id === selectedLoadoutId)?.assets ?? [])
  : ['thankyou', 'howto'] // default: show all when no loadout
```

Pass to FixedAssets or filter INITIAL_FIXED_ASSETS:
```ts
const visibleFixedAssets = INITIAL_FIXED_ASSETS.filter(a => activeAssets.includes(a.id))
```

Note: `INITIAL_FIXED_ASSETS` currently has ids `'thankyou'` and `'howto'`. README and License are not yet file-based fixed assets — they're template-generated. So for now, only `thankyou` and `howto` are filterable. README/License inclusion will be factored in when those are file-based assets.

---

## `app/api/products/[name]/config/route.ts` — add loadoutId

The POST handler must accept and persist `loadoutId` from the request body.
Update the Prisma upsert `data` to include:
```ts
loadoutId: body.loadoutId ?? null,
```

The GET handler's `toConfig()` must include:
```ts
loadoutId: product.loadoutId ?? null,
```

---

## `lib/types.ts` — update ProductConfig

Add to `ProductConfig`:
```ts
loadoutId?: string | null
```

---

## Constraints
- No new npm packages
- Dark monospace theme throughout (zinc palette, violet accents)
- The fixed-assets page must be fully functional without a product selected
- Schema changes require `npx prisma migrate dev --name add-loadouts` after implementation
- Do NOT change ZIP-building logic yet — loadout filtering of ZIP contents is a follow-up task
