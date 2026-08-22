# Spec: Subscription Billing

## Overview
Replace the current one-time Stripe Payment Link ("pay $29 once → `plan: pro` forever")
with a real recurring Stripe subscription: a dynamic Checkout Session in
subscription mode, a Stripe-hosted Customer Portal for self-service
cancel/manage, and webhook handling for the full subscription lifecycle
(created, renewed, canceled, payment failed). Single fixed monthly plan for
v1 — no tiers yet.

The existing `LicenseKey` promo-code flow is **kept**, not replaced — it's
being relabeled from "license key" to "promo code" in the UI to make it less
obscure to end users, per explicit user decision. It continues to grant
`plan: 'pro'` directly with no Stripe involvement, and is untouched by any
subscription webhook logic (see Architecture check).

## Follows the pattern of
- `app/api/stripe/webhook/route.ts` — existing webhook verifies signature via
  `stripe.webhooks.constructEvent`, branches on `event.type`. New event types
  are added as more branches in the same handler, same style.
- `lib/license.ts` / `lib/keys.ts` / `app/api/license/route.ts` /
  `app/api/activate/route.ts` — the per-user, Postgres-backed pattern
  ([[project-license-per-user]]) that the new subscription fields extend.
- `lib/db.ts` — Prisma singleton pattern; `lib/stripe.ts` (new) follows the
  same shape for the Stripe client.
- `components/LicenseBanner.tsx` — existing free/pro banner; extended in
  place, not replaced.
- `tests/integration/buy.test.ts` / `tests/integration/stripe-webhook.test.ts`
  — existing mock patterns (`mock.module('stripe', ...)`, `mock.module('@/lib/db', ...)`,
  `mock.module('@/auth', ...)`) that new/rewritten tests must follow.

## Requirements

### Functional
1. `GET /api/buy` creates a real Stripe Checkout Session in `mode:
   'subscription'` (not a static redirect) using a recurring Price ID, then
   redirects the browser to the session URL. If the user already has a
   `stripeCustomerId`, reuse it (`customer: <id>`) instead of creating a
   duplicate Stripe customer.
2. `checkout.session.completed` (subscription mode) webhook grants
   `plan: 'pro'`, and stores `stripeCustomerId`, `stripeSubscriptionId`,
   `subscriptionStatus: 'active'`, `licenseActivatedAt: now`.
3. `customer.subscription.updated` / `customer.subscription.deleted` webhooks
   keep `subscriptionStatus` in sync and set `plan` to `'pro'` when the
   Stripe status is `active`/`trialing`, `'free'` otherwise (covers
   cancellation, payment failure → `past_due`/`unpaid`, and period-end
   expiry). Matched by `stripeCustomerId` (always present by the time these
   fire), never touching users who only ever redeemed a promo code (they
   have no `stripeCustomerId`).
4. New `GET /api/billing/portal` creates a Stripe Billing Portal session for
   the current user's `stripeCustomerId` and redirects there, so the user can
   update payment method, view invoices, or cancel — all on Stripe's hosted
   UI. 400 if the user has no `stripeCustomerId` (never subscribed).
5. `GET /api/license` (via `lib/license.ts`) additionally returns
   `subscriptionStatus` so the UI can distinguish "pro via active
   subscription" (show a Manage subscription link) from "pro via promo code"
   (no Stripe relationship, no portal link to show).
6. `components/LicenseBanner.tsx`:
   - Free state: relabel the existing key input from "license key" to
     "promo code" (label + placeholder text only — same `onActivate`
     wiring, same `/api/activate` endpoint, same `LicenseKey` model). Change
     the upgrade button copy from the hardcoded "$29 one-time" to "Upgrade
     to Pro" (no hardcoded price string, since pricing isn't finalized long
     term).
   - Pro state: if `subscriptionStatus` is present, show a "Manage
     subscription" button that navigates to `/api/billing/portal`, next to
     the existing "✓ Pro" badge. If `subscriptionStatus` is absent (promo
     code grant), keep today's static badge unchanged.
7. `app/app/factory/page.tsx` wires the new `subscriptionStatus` field
   through and adds an `onManageClick` handler (`window.location.href =
   '/api/billing/portal'`), mirroring the existing `buyLicense` handler.

### Non-functional
- No custom CSS — Tailwind + shadcn components only (matches
  `LicenseBanner.tsx`'s existing `Card`/`Button`/`Input` usage).
- Server-only Stripe secret key usage stays server-side (`lib/stripe.ts`,
  API routes) — never exposed to the client.
- No hardcoded price/currency string in the UI (see requirement 6).

## Architecture check
- Layer: API routes (`app/api/**/route.ts`) + `lib/` (server-only helpers) +
  one client component (`LicenseBanner.tsx`) + its host page
  (`app/app/factory/page.tsx`). Same layering as the existing license code.
- New `lib/stripe.ts` is server-only (uses `STRIPE_SECRET_KEY`), imported
  only from API routes — never from a client component, same rule the
  codebase already follows for `lib/ai.ts` and `lib/object-storage.ts`.
- The webhook route is the **only** place that ever writes
  `subscriptionStatus`/`stripeSubscriptionId`/`stripeCustomerId` — no other
  route touches these fields, so there is a single source of truth for
  subscription state, same as today's rule that only the webhook writes
  `plan`/`licenseActivatedAt` from the Stripe side.
- `redeemKey`/`issueKey` in `lib/keys.ts` are untouched — the promo-code path
  and the subscription path are fully independent; both just end up setting
  `User.plan`.

## Schema change

Add to `model User` in `prisma/schema.prisma`, directly below `licenseActivatedAt`:

```prisma
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?   @unique
  subscriptionStatus   String?
```

Both nullable — a user who has never started checkout has neither. `@unique`
on both (one Stripe customer / one active subscription per user under the
single-plan v1 model). Run `npx prisma migrate dev --name add_subscription_fields`.

**After the migration, restart the running `next dev` process** — it holds a
stale in-memory Prisma Client otherwise and every route touching `User`
will 500 (known project gotcha, not a new bug).

## Test tier this change must climb
- **Unit**: `lib/stripe.ts`'s `getStripeClient()` — returns `null` when
  `STRIPE_SECRET_KEY` is unset, returns a `Stripe` instance when set, and
  returns the same singleton instance on a second call (mirrors
  `lib/db.ts`'s singleton test expectations if any exist — otherwise this is
  the first test for a `lib/*.ts` singleton, keep it simple).
- **Integration** (crosses the route ↔ Stripe SDK ↔ Prisma seam, same tier
  as the existing `buy.test.ts`/`stripe-webhook.test.ts`):
  - Rewrite `tests/integration/buy.test.ts`: mock `stripe` module's
    `checkout.sessions.create`; assert 401 unauth, 503 when
    `STRIPE_PRICE_ID`/`STRIPE_SECRET_KEY` unset, redirect to the created
    session's `url`, `client_reference_id` set to the user id, and that an
    existing `stripeCustomerId` is passed as `customer` instead of
    `customer_email`.
  - New `tests/integration/billing-portal.test.ts`: mock
    `stripe.billingPortal.sessions.create`; assert 401 unauth, 503 not
    configured, 400 when the user has no `stripeCustomerId`, redirect to the
    created portal session's `url` otherwise.
  - Extend `tests/integration/stripe-webhook.test.ts` with cases for
    `checkout.session.completed` in subscription mode (asserts
    `stripeCustomerId`/`stripeSubscriptionId`/`subscriptionStatus: 'active'`/
    `plan: 'pro'` all get set), `customer.subscription.updated` with
    `status: 'active'` (plan stays `'pro'`) and `status: 'past_due'`/
    `'canceled'` (plan flips to `'free'`), and `customer.subscription.deleted`
    (plan flips to `'free'`, `subscriptionStatus: 'canceled'`). Match by
    `stripeCustomerId`, per requirement 3.
  - Extend `tests/integration/license.test.ts` with a case asserting
    `subscriptionStatus` is passed through in the `GET /api/license` response
    when present on the user record.
- **UI E2E + visual review**: this changes what the user sees/clicks in
  `LicenseBanner.tsx` (new "Manage subscription" button, relabeled promo-code
  input, changed upgrade button copy) — required, see plan file for how
  Phase 8 will render/verify it since a real Stripe subscription can't be
  created in local dev without live Stripe.

## Implementation

### Files to create

#### 1. `lib/stripe.ts`
Blueprint: `lib/db.ts` (singleton pattern)
```ts
import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null
  if (!client) client = new Stripe(secretKey)
  return client
}
```

#### 2. `app/api/billing/portal/route.ts`
Blueprint: `app/api/buy/route.ts` (auth check + redirect shape)
```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = getStripeClient()
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/app/factory`,
  })

  return NextResponse.redirect(portalSession.url)
}
```

### Files to modify

#### 3. `prisma/schema.prisma`
Add the three fields to `model User` as shown in "Schema change" above. Run
the migration.

#### 4. `app/api/buy/route.ts`
Replace the static-URL redirect with a dynamic Checkout Session:
```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getStripeClient } from '@/lib/stripe'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const priceId = process.env.STRIPE_PRICE_ID
  const stripe = getStripeClient()
  if (!priceId || !stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true },
  })
  const origin = new URL(request.url).origin

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: session.user.id,
    ...(user?.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: session.user.email ?? undefined }),
    success_url: `${origin}/app/factory?upgraded=1`,
    cancel_url: `${origin}/app/factory`,
  })

  if (!checkoutSession.url) {
    return NextResponse.json({ error: 'Could not create checkout session' }, { status: 502 })
  }
  return NextResponse.redirect(checkoutSession.url)
}
```
Note the signature changes from `GET()` to `GET(request: Request)` — needed
for `origin`. `tests/integration/buy.test.ts` must be rewritten accordingly
(see Test tier section) — the old `STRIPE_CHECKOUT_URL` env var and static-URL
assertions no longer apply.

#### 5. `app/api/stripe/webhook/route.ts`
Add branches for the subscription lifecycle, alongside the existing
`checkout.session.completed` handling (extend, don't remove — one-time promo
activation still runs through `lib/keys.ts`, this webhook only handles the
Stripe-native subscription path):
```ts
if (event.type === 'checkout.session.completed') {
  const checkoutSession = event.data.object as Stripe.Checkout.Session
  const userId = checkoutSession.client_reference_id
  if (userId) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'pro',
          licenseActivatedAt: new Date(),
          stripeCustomerId: checkoutSession.customer as string,
          stripeSubscriptionId: checkoutSession.subscription as string,
          subscriptionStatus: 'active',
        },
      })
    } catch (err) {
      console.error(`Stripe webhook: could not grant plan to user ${userId}`, err)
    }
  } else {
    console.error('Stripe webhook: checkout.session.completed with no client_reference_id')
  }
}

if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
  const subscription = event.data.object as Stripe.Subscription
  const customerId = subscription.customer as string
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'
  try {
    await prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
        plan: isActive ? 'pro' : 'free',
      },
    })
  } catch (err) {
    console.error(`Stripe webhook: could not sync subscription for customer ${customerId}`, err)
  }
}
```
Use `updateMany` (not `update`) since the match is on `stripeCustomerId`, a
`where` filter, not the primary key.

#### 6. `lib/license.ts`
```ts
import { prisma } from '@/lib/db'

export async function getUserLicense(
  userId: string,
): Promise<{ plan: 'free' | 'pro'; activatedAt?: string; subscriptionStatus?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, licenseActivatedAt: true, subscriptionStatus: true },
  })
  return {
    plan: (user?.plan as 'free' | 'pro') ?? 'free',
    activatedAt: user?.licenseActivatedAt?.toISOString(),
    subscriptionStatus: user?.subscriptionStatus ?? undefined,
  }
}
```

#### 7. `components/LicenseBanner.tsx`
- Add `subscriptionStatus?: string` and `onManageClick: () => void` to `Props`.
- Free-state form: change `placeholder="Enter license key"` →
  `placeholder="Enter promo code"`; add a small label above/beside it reading
  "Have a promo code?" instead of leaving it unlabeled inline.
- Change the upgrade button text from `Upgrade → $29 one-time` to `Upgrade to Pro`.
- Pro-state card: when `subscriptionStatus` is truthy, render a
  `Button variant="outline"` reading "Manage subscription" that calls
  `onManageClick`, alongside the existing "✓ Pro" text. When
  `subscriptionStatus` is falsy (promo-granted), render exactly as today.

#### 8. `app/app/factory/page.tsx`
- `type License` gains `subscriptionStatus?: string`.
- Add `const manageSubscription = () => { window.location.href = '/api/billing/portal' }`,
  mirroring `buyLicense` (line ~357).
- Pass `subscriptionStatus={license.subscriptionStatus}` and
  `onManageClick={manageSubscription}` to the `<LicenseBanner>` at line ~385.

#### 9. `.env.example`
Replace:
```
# Create a payment link at https://dashboard.stripe.com/payment-links
STRIPE_CHECKOUT_URL=https://buy.stripe.com/...
```
with:
```
# Create a recurring monthly Price at https://dashboard.stripe.com/prices,
# then paste its Price ID (starts with price_) below.
STRIPE_PRICE_ID=price_...
# Enable the Customer Portal (for self-service cancel/manage) at
# https://dashboard.stripe.com/test/settings/billing/portal — required for
# GET /api/billing/portal to work.
```
Keep `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` lines unchanged.

## Files Summary
| Action | Path | Blueprint |
|--------|------|-----------|
| CREATE | `lib/stripe.ts` | based on `lib/db.ts` |
| CREATE | `app/api/billing/portal/route.ts` | based on `app/api/buy/route.ts` |
| CREATE | `tests/integration/billing-portal.test.ts` | based on `tests/integration/buy.test.ts` |
| MODIFY | `prisma/schema.prisma` | — |
| MODIFY | `app/api/buy/route.ts` | — |
| MODIFY | `app/api/stripe/webhook/route.ts` | — |
| MODIFY | `lib/license.ts` | — |
| MODIFY | `components/LicenseBanner.tsx` | — |
| MODIFY | `app/app/factory/page.tsx` | — |
| MODIFY | `.env.example` | — |
| MODIFY | `tests/integration/buy.test.ts` | — |
| MODIFY | `tests/integration/stripe-webhook.test.ts` | — |
| MODIFY | `tests/integration/license.test.ts` | — |

## Out of Scope
- Annual pricing / multiple plan tiers (explicit user decision: single fixed
  monthly plan for v1).
- Storage-tier-based pricing (user flagged this as a future direction, not now).
- Retiring the promo-code (`LicenseKey`) flow (explicit user decision: keep it).
- A dedicated Billing section on the Settings page — the relabeled banner on
  the Factory page stays the single home for both promo-code redemption and
  subscription management, per the existing UI's structure.
- Proration, trials, coupons, dunning emails — bare subscription lifecycle only.
- Idempotency-key handling for webhook retries (matches the existing
  webhook's behavior — same risk profile as what's already in production, not
  a new gap introduced by this change).

## Verification
1. `npm run dev`
2. `npx prisma migrate dev --name add_subscription_fields` then restart the
   dev server (stale Prisma Client gotcha).
3. With `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID`/`STRIPE_WEBHOOK_SECRET` set to
   real Stripe test-mode values and `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` running: log in, click "Upgrade to
   Pro" on `/app/factory`, complete Stripe test checkout, confirm the banner
   flips to "✓ Pro" with a "Manage subscription" button, click it, confirm
   redirect to the real Stripe portal, cancel there, confirm (via webhook)
   the banner flips back to free on next load.
4. Confirm a promo-code redemption (`/api/activate`) still works and shows no
   "Manage subscription" button (no `subscriptionStatus`).
