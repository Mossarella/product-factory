# Spec: Per-user license/plan (Postgres), fix Stripe → user linkage

## Overview
`license.json` and `keys.json` (via `lib/license.ts`/`lib/keys.ts`) are
single global files for the entire app instance — not scoped by user at
all. In the current auth-enabled, multi-tenant state (`Product.userId`
already properly scopes every product), this means: **any signed-up user
who activates a license key flips `plan: 'pro'` for every other user on
the deployment**, and the free-tier "3 products" gate in
`app/api/products/route.ts` reads that same global file. This is a live
bug, not just filesystem-readiness prep — found while auditing all
filesystem usage ahead of a real multi-tenant SaaS deployment. It's also,
literally, one of the filesystem stores being asked about, so fixing it
is in scope.

Additionally, `app/api/buy/route.ts` redirects to a static Stripe
Payment Link with no way to know which user paid, and
`app/api/stripe/webhook/route.ts` just issues a key into the global file
on `checkout.session.completed` with no association to any user at all.

## Follows the pattern of
- `app/api/profile/avatar/route.ts` (this session's prior fs→Postgres
  migration) — same shape: replace a file-backed `lib/*.ts` helper with
  a Prisma-backed one, keep the route's request/response contract
  identical so no frontend changes are needed.
- Every existing per-user route (`app/api/products/*`) — `auth()` →
  `session.user.id` → scope every query by it.

## Design decision: skip key-issuance for the Stripe path entirely
Today, `checkout.session.completed` calls `issueKey()`, producing an
unredeemed key nobody is shown (no email delivery exists) — a vestige of
the pre-auth single-shop design. Now that Stripe Checkout can carry
`client_reference_id`, the correct fix is to attach the current user's id
to the checkout URL in `app/api/buy/route.ts`, then have the webhook read
`client_reference_id` and grant that specific user's `plan` directly —
no intermediate key needed for purchases made through this app's own Buy
button. The manual "type in a license key" flow (`/api/activate`) stays,
now backed by a `LicenseKey` Postgres table instead of `keys.json`, for
keys issued out-of-band (support-granted, gifted, etc.) — decoupled from
the Stripe path.

## Implementation

### 1. Schema (I run this migration myself, same precedent as prior migrations)
```prisma
model User {
  // ...existing fields...
  plan               String       @default("free")
  licenseActivatedAt DateTime?
  licenseKeys        LicenseKey[]
}

model LicenseKey {
  id           String    @id @default(cuid())
  key          String    @unique
  plan         String    @default("pro")
  issuedAt     DateTime  @default(now())
  usedAt       DateTime?
  usedByUserId String?
  usedByUser   User?     @relation(fields: [usedByUserId], references: [id])

  @@index([usedByUserId])
}
```
Run `npx prisma migrate dev --name add_user_license`.

### 2. `lib/license.ts` (Codex agent, full rewrite)
```ts
import { prisma } from '@/lib/db'

export async function getUserLicense(userId: string): Promise<{ plan: 'free' | 'pro'; activatedAt?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, licenseActivatedAt: true } })
  return {
    plan: (user?.plan as 'free' | 'pro') ?? 'free',
    activatedAt: user?.licenseActivatedAt?.toISOString(),
  }
}
```

### 3. `lib/keys.ts` (Codex agent, full rewrite)
```ts
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'

export async function issueKey(plan = 'pro'): Promise<string> {
  const key = randomUUID()
  await prisma.licenseKey.create({ data: { key, plan } })
  return key
}

export async function redeemKey(
  key: string,
  userId: string,
): Promise<{ plan: string; activatedAt: string } | { error: string }> {
  const record = await prisma.licenseKey.findUnique({ where: { key } })
  if (!record) return { error: 'Invalid license key' }

  if (record.usedAt) {
    if (record.usedByUserId === userId) {
      return { plan: record.plan, activatedAt: record.usedAt.toISOString() }
    }
    return { error: 'Key already activated' }
  }

  const activatedAt = new Date()
  await prisma.$transaction([
    prisma.licenseKey.update({ where: { key }, data: { usedAt: activatedAt, usedByUserId: userId } }),
    prisma.user.update({ where: { id: userId }, data: { plan: record.plan, licenseActivatedAt: activatedAt } }),
  ])
  return { plan: record.plan, activatedAt: activatedAt.toISOString() }
}
```
Note: `issueKey()` is kept for a possible future admin/support tool to
mint keys, but nothing in this change set calls it automatically anymore
(see design decision above) — it's fine for it to be currently unused by
any route; do not delete it.

### 4. `app/api/license/route.ts` (Codex agent, full rewrite)
```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getUserLicense } from '@/lib/license'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const license = await getUserLicense(session.user.id)
  return NextResponse.json(license)
}
```

### 5. `app/api/activate/route.ts` (Codex agent, full rewrite)
```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { redeemKey } from '@/lib/keys'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key } = await request.json() as { key: string }
  const result = await redeemKey(key, session.user.id)

  if ('error' in result) {
    const status = result.error === 'Invalid license key' ? 404 : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json(result)
}
```

### 6. `app/api/buy/route.ts` (Codex agent, full rewrite)
```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.STRIPE_CHECKOUT_URL
  if (!url) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const checkoutUrl = new URL(url)
  checkoutUrl.searchParams.set('client_reference_id', session.user.id)
  return NextResponse.redirect(checkoutUrl.toString())
}
```
(Stripe Payment Links accept `client_reference_id` as a query parameter
and attach it to the resulting Checkout Session — no Stripe dashboard
change needed, just this route change.)

### 7. `app/api/stripe/webhook/route.ts` (Codex agent, full rewrite)
```ts
import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const rawBody = Buffer.from(await req.arrayBuffer())
  const sig = req.headers.get('stripe-signature') ?? ''
  const stripe = new Stripe(secretKey)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const checkoutSession = event.data.object as Stripe.Checkout.Session
    const userId = checkoutSession.client_reference_id
    if (userId) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { plan: 'pro', licenseActivatedAt: new Date() },
        })
      } catch (err) {
        console.error(`Stripe webhook: could not grant plan to user ${userId}`, err)
      }
    } else {
      console.error('Stripe webhook: checkout.session.completed with no client_reference_id')
    }
  }

  return NextResponse.json({ received: true })
}
```

### 8. `app/api/products/route.ts` (Codex agent, targeted edit)
Remove the inline duplicate license reader:
```ts
function readLicense(): { plan: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'license.json'), 'utf8'))
  } catch {
    return { plan: 'free' }
  }
}
```
and its usage
```ts
  if (readLicense().plan === 'free' && productCount >= 3) {
```
Replace the usage with a per-user Prisma check:
```ts
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
  if ((user?.plan ?? 'free') === 'free' && productCount >= 3) {
```
Remove `ROOT` from the `import { PRODUCTS_DIR, ROOT, sanitizeName } from '@/lib/api-files'` line (becomes `import { PRODUCTS_DIR, sanitizeName } from '@/lib/api-files'`) — `ROOT` is no longer used anywhere in this file. Keep `fs`/`path` imports and the `mkdirSync` directory-scaffolding block exactly as they are — that's filesystem storage for product files, a separate follow-up (object storage migration), not part of this change.

## Out of Scope (this phase)
- Object storage migration for mascot files/fixed assets/build ZIPs/Etsy
  listing images — separate follow-up, tracked at
  `docs/object-storage-migration.md`. `assets/` (shop-wide logo/thank-you/
  how-to defaults) and `templates/*.txt` are fine to leave as bundled,
  read-only, deploy-time static content — nothing ever writes to them at
  runtime, so they're not a serverless-readiness problem the way
  runtime-mutable data is.
- No admin UI for minting `LicenseKey` rows — `issueKey()` stays a plain
  library function for now, callable from a script/console if needed.
- `.env.example`/`STRIPE_CHECKOUT_URL` format is unchanged — Payment
  Links already support the `client_reference_id` query param natively.

## Tests (mandatory)
- `tests/integration/license.test.ts` (new) — GET: 401 unauthenticated,
  200 returns the authenticated user's own plan (mock
  `prisma.user.findUnique` per-test, confirm two different mocked users
  get their own distinct plans, not a shared value).
- `tests/integration/activate.test.ts` (new) — POST: 401 unauthenticated,
  404 unknown key, 200 on first redemption (assert both
  `prisma.licenseKey.update` and `prisma.user.update` were called via the
  `$transaction` mock), 200 idempotent re-activation by the SAME user
  (returns the original `activatedAt`, no additional writes), 409 when a
  DIFFERENT user tries to redeem an already-used key.
- `tests/integration/buy.test.ts` (new) — GET: 401 unauthenticated
  (middleware normally handles this, but test the handler directly), 503
  when `STRIPE_CHECKOUT_URL` unset, 302/redirect with
  `client_reference_id=<userId>` present in the redirect URL when set.
- `tests/integration/stripe-webhook.test.ts` (new) — POST:
  503 when Stripe env vars unset, 400 on signature verification failure
  (mock `Stripe.webhooks.constructEvent` to throw), 200 + `prisma.user.update`
  called with the right userId + `plan: 'pro'` when `client_reference_id`
  is present on a `checkout.session.completed` event, 200 with NO
  `prisma.user.update` call (just a logged error) when
  `client_reference_id` is missing.
- Update `tests/integration/products.test.ts`: replace the `fs.readFileSync`
  license mock with a `prisma.user.findUnique` mock (add `user: {
  findUnique: mockUserFindUnique }` to the existing `@/lib/db` mock,
  defaulting to `{ plan: 'pro' }` to preserve existing passing tests'
  behavior), and add two new cases: free-plan user with 3 existing
  products gets 403, pro-plan user with 3+ existing products still gets
  201.

## Verification
1. `npx prisma migrate dev --name add_user_license` — confirm additive.
2. `npx tsc --noEmit`, `bun test tests/unit tests/integration`.
3. Manually: log in as two different seeded/dev users (or reuse the dev
   magic-link bypass with two different emails), activate a license key
   as user A, confirm user B's `/api/license` still reports `free`.
