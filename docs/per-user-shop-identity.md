# Spec: Per-user shop identity

## Overview
`config.ts`'s `CONFIG.shopName`/`CONFIG.contact`/`CONFIG.description`/
`CONFIG.readmeFooter` are a single hardcoded shop identity
("MossarellaStudio") baked into **every** user's generated README/Etsy
text and AI-generated description, regardless of who owns the product.
License and file storage are now properly per-user (this session's
earlier work) — this is the last real single-tenant remnant, and it's
actively wrong for a multi-seller SaaS: every seller's package currently
says someone else's shop name. This makes shop identity per-user,
editable from Settings, with sensible non-branded fallbacks for anyone
who hasn't customized it yet.

Also fixes the app's own chrome (sidebar, marketing/login pages, page
titles) which currently hardcode "MossarellaStudio" as if the SaaS
itself were that one shop — those become either the signed-in user's own
shop name (sidebar) or the SaaS's own name "Product Factory" alone
(marketing/login, shown to anonymous visitors, not tied to any tenant).

## Follows the pattern of
- `lib/templates.ts`'s existing `TemplateData`/`fillTemplate()` — pure,
  client-safe, no imports. The new `resolveTemplateData()` helper joins
  it, staying just as pure (defaults passed in as a parameter, not
  imported from `config.ts`, so this file never needs a server-only or
  even config-coupled import).
- `app/api/profile/route.ts` + `app/app/settings/page.tsx`'s existing
  `saveName()` flow (POST → `prisma.user.update` → client `update({
  name })` to refresh the session) — the new Shop Profile fields reuse
  this exact request/response/session-refresh shape.
- `auth.ts`'s existing conditional `trigger === 'update'` handling for
  `session.name`/`session.image` — the new shop fields follow the exact
  same pattern.

## Data model
Add to `User` (all nullable — `null` means "not customized yet", falls
back to a sensible generic, non-branded default):
```prisma
shopName        String?
shopContact     String?
shopDescription String?
readmeFooter    String?
```

## Fallback chain (resolved once, shared everywhere)
For a given product build/preview: `product.field` (already exists on
`Product`: `contact`, `description`, `notes`) wins if set → else the
user's own `shop*` field → else a generic default. `shopName` has no
per-product override today and none is being added; it falls back to
the seller's own account `name`, then a neutral placeholder.

## Implementation

### 1. Schema (I run this migration myself, same precedent as prior migrations)
Add the four columns above to `User`. Run
`npx prisma migrate dev --name add_shop_identity`.

### 2. `config.ts` (Codex agent, edit)
Remove `shopName`/`contact` entirely (no generic fallback makes sense
for a shop's actual name/contact info — must be real or blank). Rename
`description`/`readmeFooter` to `defaultShopDescription`/
`defaultReadmeFooter` (these ARE reasonable universal generic defaults,
not brand-specific — keep their current text verbatim as the new
per-user-field fallback, so a fresh user's output quality doesn't
regress). Keep `etsyTagDefaults`/`extraFixedAssets` untouched — global,
not part of this leak (see "Out of Scope").

### 3. `lib/templates.ts` (Codex agent, edit — add a pure helper)
```ts
export interface ShopIdentity {
  name?: string | null
  shopName?: string | null
  shopContact?: string | null
  shopDescription?: string | null
  readmeFooter?: string | null
}

export interface ProductTemplateFields {
  productName: string
  etsyTitle: string
  contact: string
  description: string
  notes: string
  licenseType: 'personal' | 'commercial' | 'both'
  price: number
  commercialPrice?: number
  currency: string
  folders: Array<{ label: string; count: number }>
  etsyTags: string[]
}

export function resolveTemplateData(
  product: ProductTemplateFields,
  shop: ShopIdentity,
  defaults: { defaultShopDescription: string; defaultReadmeFooter: string },
): TemplateData {
  return {
    name: product.productName,
    etsyName: product.etsyTitle,
    shopName: shop.shopName || shop.name || 'My Shop',
    contact: product.contact || shop.shopContact || '',
    description: product.description || shop.shopDescription || defaults.defaultShopDescription,
    notes: product.notes || shop.readmeFooter || defaults.defaultReadmeFooter,
    licenseType: product.licenseType,
    price: product.price,
    commercialPrice: product.commercialPrice,
    currency: product.currency,
    folders: product.folders,
    etsyTags: product.etsyTags,
  }
}
```
Keep the existing `TemplateData` interface and `fillTemplate()` exactly
as they are — this is additive.

### 4. `types/next-auth.d.ts` (Codex agent, edit)
```ts
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      shopName?: string | null
      shopContact?: string | null
      shopDescription?: string | null
      readmeFooter?: string | null
    } & DefaultSession['user']
  }
}
```

### 5. `auth.ts` (Codex agent, edit)
Extend both callbacks with the 4 new fields, mirroring the existing
`name`/`image` handling exactly:
```ts
jwt({ token, user, trigger, session }) {
  if (user) token.sub = user.id
  if (trigger === 'update' && session) {
    if (typeof session.name === 'string') token.name = session.name
    if (typeof session.image === 'string') token.picture = session.image
    if (typeof session.shopName === 'string') token.shopName = session.shopName
    if (typeof session.shopContact === 'string') token.shopContact = session.shopContact
    if (typeof session.shopDescription === 'string') token.shopDescription = session.shopDescription
    if (typeof session.readmeFooter === 'string') token.readmeFooter = session.readmeFooter
  }
  return token
},
session({ session, token }) {
  if (session.user && token.sub) {
    session.user.id = token.sub
    session.user.name = (token.name as string | null) ?? session.user.name
    session.user.image = (token.picture as string | null) ?? null
    session.user.shopName = (token.shopName as string | null) ?? null
    session.user.shopContact = (token.shopContact as string | null) ?? null
    session.user.shopDescription = (token.shopDescription as string | null) ?? null
    session.user.readmeFooter = (token.readmeFooter as string | null) ?? null
  }
  return session
},
```

### 6. `app/api/profile/route.ts` (Codex agent, edit — add GET, extend POST)
```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true },
  })
  return NextResponse.json(user)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    name?: string
    shopName?: string
    shopContact?: string
    shopDescription?: string
    readmeFooter?: string
  }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      shopName: body.shopName?.trim() || null,
      shopContact: body.shopContact?.trim() || null,
      shopDescription: body.shopDescription?.trim() || null,
      readmeFooter: body.readmeFooter?.trim() || null,
    },
    select: { name: true, shopName: true, shopContact: true, shopDescription: true, readmeFooter: true },
  })
  return NextResponse.json(updated)
}
```
Note: this makes the shop-identity fields update in the SAME POST as
`name` (the endpoint already requires `name`) — the settings page sends
the current `name` value alongside whichever shop field the user is
saving, same as today's single combined shape, just with more optional
keys.

### 7. `app/app/settings/page.tsx` (Codex agent, edit — add a Shop Profile card)
Fetch initial shop-identity values via `GET /api/profile` on mount (NOT
from `useSession()`, which may be stale until an `update()` call — see
[[project-avatar-db-storage]]-era precedent). Add a second `<Card>` below
the existing Profile card:
```tsx
const [shopName, setShopName] = useState('')
const [shopContact, setShopContact] = useState('')
const [shopDescription, setShopDescription] = useState('')
const [readmeFooter, setReadmeFooter] = useState('')
const [shopSaving, setShopSaving] = useState(false)
const [shopSaveFlash, setShopSaveFlash] = useState(false)

useEffect(() => {
  fetch('/api/profile').then((r) => r.ok ? r.json() : null).then((data) => {
    if (!data) return
    setShopName(data.shopName ?? '')
    setShopContact(data.shopContact ?? '')
    setShopDescription(data.shopDescription ?? '')
    setReadmeFooter(data.readmeFooter ?? '')
  })
}, [])

async function saveShopProfile() {
  setShopSaving(true)
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, shopName, shopContact, shopDescription, readmeFooter }),
  })
  if (res.ok) {
    await update({ shopName, shopContact, shopDescription, readmeFooter })
    setShopSaveFlash(true)
    setTimeout(() => setShopSaveFlash(false), 2000)
  }
  setShopSaving(false)
}
```
New Card JSX (same styling conventions as the existing Profile card —
`Card`, `Label`, `Input`, `Button`):
```tsx
<Card className="gap-4 px-4 py-4 font-mono ring-zinc-800">
  <h2 className="text-xs text-zinc-600 uppercase tracking-widest">Shop Profile</h2>
  <p className="text-xs text-zinc-500">
    Used in your generated READMEs and Etsy listings. Leave blank to use a generic default.
  </p>
  <div>
    <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Shop name</Label>
    <Input value={shopName} onChange={(e) => setShopName(e.target.value)} className="max-w-xs" placeholder={name || 'My Shop'} />
  </div>
  <div>
    <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Contact info</Label>
    <Input value={shopContact} onChange={(e) => setShopContact(e.target.value)} className="max-w-xs" placeholder="etsy.com/shop/yourshop" />
  </div>
  <div>
    <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Default product description</Label>
    <Input value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} placeholder="A handcrafted digital product made with love." />
  </div>
  <div>
    <Label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">README footer / license note</Label>
    <Input value={readmeFooter} onChange={(e) => setReadmeFooter(e.target.value)} placeholder="Personal and commercial use allowed with credit. Do not redistribute." />
  </div>
  <div className="flex items-center gap-2">
    <Button type="button" variant="default" disabled={shopSaving} onClick={() => void saveShopProfile()}>
      {shopSaving ? 'Saving…' : 'Save'}
    </Button>
    {shopSaveFlash && <span className="text-xs text-emerald-400">Saved!</span>}
  </div>
</Card>
```
Add `useEffect` to the existing `'use client'`/`useRef, useState` import
line.

### 8. `app/app/factory/page.tsx` (Codex agent, edit)
Fetch shop identity once alongside the existing initial-load effect
(`GET /api/profile`), store in state, pass down as a new
`shopIdentity` prop to `<ReadmePreview>` and `<EtsyListing>`.

### 9. `components/ReadmePreview.tsx` (Codex agent, edit)
Add a `shopIdentity: { name?: string | null; shopName?: string | null; shopContact?: string | null; shopDescription?: string | null; readmeFooter?: string | null }`
prop. Replace the four `CONFIG.*` references in the inline
`.replace(...)` chain:
```ts
.replace(/{{shopName}}/g, shopIdentity.shopName || shopIdentity.name || 'My Shop')
.replace(/{{contact}}/g, config.contact || shopIdentity.shopContact || '')
.replace(/{{description}}/g, config.description || shopIdentity.shopDescription || CONFIG.defaultShopDescription)
.replace(/{{notes}}/g, config.notes || shopIdentity.readmeFooter || CONFIG.defaultReadmeFooter)
```
Keep the `import { CONFIG } from '@/config'` (still needed for the two
default constants) — just the field names it reads change.

### 10. `components/EtsyListing.tsx` (Codex agent, edit)
Add the same `shopIdentity` prop; change `shopName: ''` in the
`templateData` memo to `shopName: shopIdentity.shopName || shopIdentity.name || 'My Shop'`
— this also fixes a real quality gap: AI-generated descriptions/tags
currently never mention any shop name at all.

### 11. `components/Sidebar.tsx` (Codex agent, edit)
Replace the hardcoded `<p ...>MossarellaStudio</p>` with the signed-in
user's own identity:
```tsx
const shopLabel = session?.user?.shopName || name || 'My Shop'
...
<p className="text-xs text-zinc-600 font-mono mt-0.5">{shopLabel}</p>
```

### 12. App-chrome branding (Codex agent, small string edits — NOT per-user, these are anonymous-visitor pages)
Remove "MossarellaStudio" from the SaaS's own chrome, since these pages
aren't about any one tenant:
- `app/layout.tsx` — `<title>` from `"Product Factory — MossarellaStudio"` to `"Product Factory"`.
- `app/app/layout.tsx` — same title fix.
- `app/page.tsx` — nav/footer text `"MossarellaStudio — Product Factory"` → `"Product Factory"` (both occurrences).
- `app/login/page.tsx` — eyebrow text `"MossarellaStudio"` → `"Product Factory"`.

## Out of Scope
- `etsyTagDefaults` staying global (not per-user) — lower priority,
  never leaks one user's data into another's build output (unlike the
  4 fields above), fine as a shared suggested-tags default for now.
- `README.md` at the repo root is stale (describes the old vanilla-JS
  single-tenant architecture) — a documentation-only fix, unrelated to
  this code change, not addressed here.
- No UI to preview how the shop identity fields will render before
  saving (the existing README/Etsy preview panels already serve this
  purpose once shop identity is wired through them).

## Tests (mandatory)
- `tests/unit/templates.test.ts` (extend existing file if present, else
  add cases) — `resolveTemplateData()`: product field wins when set;
  falls back to shop field when product field empty; falls back to
  `shop.name` when `shop.shopName` unset; falls back to `'My Shop'` when
  neither set; falls back to provided defaults for description/notes
  when both product and shop fields are empty.
- `tests/integration/profile.test.ts` (new, or extend if a profile
  route test exists) — GET: 401 unauthenticated, 200 returns the
  current user's shop fields. POST: 400 missing name (existing
  behavior unchanged), 200 saves and returns all 5 fields, `null` when
  a field is blank/whitespace-only.
- Extend `tests/integration/products-build.test.ts`: the build route's
  README generation now depends on `product.user`'s shop fields —
  confirm the mocked `prisma.product.findUnique` needs a `user: {...}`
  object in its fixture, and add a case showing a build reflects a
  templated shop name when the mocked user has one set vs. falls back
  to the mocked user's `name` when not.

## Verification
1. `npx prisma migrate dev --name add_shop_identity` — confirm additive.
2. `npx tsc --noEmit`, `bun test tests/unit tests/integration`.
3. Manually: as a fresh dev user with no shop fields set, build a
   product — confirm the README shows their account name as the shop
   name and the generic default description/footer text (not
   "MossarellaStudio"). Set a custom Shop Profile in Settings, build
   again — confirm the new values appear. Confirm the sidebar now shows
   the same shop name instead of "MossarellaStudio". Confirm the
   logged-out marketing/login pages just say "Product Factory".
