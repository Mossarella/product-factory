# Batch 1B — License API routes + lib/license.ts + lib/keys.ts

Read `docs/v2-conventions.md` first.

## Your task
Implement the license gate system: flat-file key store, validation, Stripe webhook.

## Files to create

### `lib/license.ts`
```ts
import fs from 'fs'
import path from 'path'

const LICENSE_PATH = path.join(process.cwd(), 'license.json')

export interface LicenseData {
  key: string
  plan: 'free' | 'pro'
  activatedAt: string
}

export function readLicense(): { plan: 'free' | 'pro'; activatedAt?: string; key?: string } {
  try {
    return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'))
  } catch {
    return { plan: 'free' }
  }
}

export function writeLicense(data: LicenseData): void {
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2))
}
```

### `lib/keys.ts`
```ts
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const KEYS_PATH = path.join(process.cwd(), 'keys.json')

export interface KeyRecord {
  plan: 'pro'
  issuedAt: string
  used: boolean
}

export type KeyStore = Record<string, KeyRecord>

export function readKeys(): KeyStore {
  try { return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')) }
  catch { return {} }
}

export function writeKeys(store: KeyStore): void {
  fs.writeFileSync(KEYS_PATH, JSON.stringify(store, null, 2))
}

export function issueKey(): string {
  const store = readKeys()
  const key = randomUUID()
  store[key] = { plan: 'pro', issuedAt: new Date().toISOString(), used: false }
  writeKeys(store)
  return key
}

export function validateKey(key: string): KeyRecord | null {
  const store = readKeys()
  return store[key] ?? null
}

export function markKeyUsed(key: string): void {
  const store = readKeys()
  if (store[key]) { store[key].used = true; writeKeys(store) }
}
```

### `app/api/license/route.ts`
GET — return current license status
```ts
import { readLicense } from '@/lib/license'
import { NextResponse } from 'next/server'
export async function GET() {
  const license = readLicense()
  return NextResponse.json(license)
}
```

### `app/api/activate/route.ts`
POST — body `{ key: string }` → validate and activate
- Read key from body
- Call `validateKey(key)` from `lib/keys.ts`
- If not found: return 404 `{ error: 'Invalid license key' }`
- If already used AND license.json already has this key: return 200 (idempotent)
- If already used by someone else: return 409 `{ error: 'Key already activated' }`
- Write license: `writeLicense({ key, plan: record.plan, activatedAt: now })`
- Mark key used: `markKeyUsed(key)`
- Return 200 `{ plan: 'pro', activatedAt }`

### `app/api/buy/route.ts`
GET — redirect to Stripe Checkout
```ts
import { NextResponse } from 'next/server'
export async function GET() {
  const url = process.env.STRIPE_CHECKOUT_URL
  if (!url) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  return NextResponse.redirect(url)
}
```

### `app/api/stripe/webhook/route.ts`
POST — Stripe webhook → issue license key
- Read raw body as Buffer (do NOT use req.json() — Stripe needs raw body for signature)
- Verify signature using `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`
- On `checkout.session.completed` event: call `issueKey()` and log it
- (Key delivery to user is manual for now — just log `Issued key: <key>`)
- Return 200 `{ received: true }`
- If signature fails: return 400

```ts
import Stripe from 'stripe'
import { issueKey } from '@/lib/keys'
import { NextRequest, NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer())
  const sig = req.headers.get('stripe-signature') ?? ''
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const key = issueKey()
    console.log(`=== License key issued: ${key} ===`)
  }

  return NextResponse.json({ received: true })
}
```

## Note on Stripe env vars
If `STRIPE_SECRET_KEY` is not set in `.env.local`, the webhook and buy routes should
gracefully return 503. Do not throw at module level — guard inside handlers.

Print `=== COMPLETE: batch-1b-license-api ===` when done.
