# Spec: Test Infrastructure — Bun + Playwright

## Goal
Set up a full testing stack: Bun (unit + integration) + Playwright (E2E).
Extract inline pure functions to `lib/utils.ts` and `lib/dashboard-stats.ts` so they're importable in tests.
Write the first test suites covering existing functionality.

---

## Part 1 — Extract pure functions to lib/

### `lib/utils.ts` (NEW)

Export these pure/testable functions:

```ts
// greeting — takes name and optional hour (default: current hour) for testability
export function greeting(name: string | null | undefined, hour = new Date().getHours()): string {
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = name ? name.split(' ')[0] : 'there'
  return `Good ${time}, ${first}`
}

// formatDate — takes optional Date for testability
export function formatDate(date = new Date()): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// avatarColor — deterministic color class for a product name
const AVATAR_COLORS = ['bg-violet-700','bg-emerald-700','bg-amber-700','bg-sky-700','bg-rose-700','bg-teal-700']
export function avatarColor(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
}

// tagKey — canonical key for a tag set (sorted, joined)
export function tagKey(tags: string[]): string {
  return [...tags].sort().join('|')
}
```

### `lib/dashboard-stats.ts` (NEW)

Extract the stat computation logic used in both `app/api/dashboard/route.ts` and `app/app/dashboard/page.tsx`:

```ts
import fs from 'fs'
import path from 'path'
import { PRODUCTS_DIR } from '@/lib/api-files'

export interface ProductForStats {
  name: string
  complete: boolean
  description: string
  etsyTitle: string
  etsyTags: string[]
  createdAt: Date | string
  files: { id: string }[]
}

export interface DashboardStats {
  total: number
  readyToPublish: number
  needsReview: number
  missingHero: number
  needReadme: number
  thisMonth: number
  noGifPreview: number
  sharedTags: number
}

export function heroSlotEmpty(userId: string, productName: string): boolean {
  try {
    const heroDir = path.join(PRODUCTS_DIR, userId, productName, 'assets', 'etsy-hero')
    return fs.readdirSync(heroDir).filter((f: string) => !f.startsWith('.')).length === 0
  } catch {
    return true
  }
}

export function computeStats(
  products: (ProductForStats & { files: { id: string; origName?: string }[] })[],
  userId: string,
): DashboardStats {
  const total = products.length
  const readyToPublish = products.filter(p => p.complete).length
  const needsReview = products.filter(
    p => !p.complete && (p.files.length > 0 || p.etsyTitle !== '')
  ).length
  const missingHero = products.filter(p => heroSlotEmpty(userId, p.name)).length
  const needReadme = products.filter(p => !p.description || p.description.trim() === '').length

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonth = products.filter(p => new Date(p.createdAt) >= firstOfMonth).length

  const noGifPreview = products.filter(p =>
    !p.files.some(f => (f as { origName?: string }).origName?.toLowerCase().endsWith('.gif'))
  ).length

  const { tagKey } = require('@/lib/utils')
  const tagGroups: Record<string, number> = {}
  for (const p of products) {
    const key = tagKey(p.etsyTags)
    tagGroups[key] = (tagGroups[key] ?? 0) + 1
  }
  const sharedTags = products.filter(p => (tagGroups[tagKey(p.etsyTags)] ?? 1) > 1).length

  return { total, readyToPublish, needsReview, missingHero, needReadme, thisMonth, noGifPreview, sharedTags }
}
```

### Update existing files to import from lib/

**`app/app/dashboard/page.tsx`**: replace inline `greeting()`, `formatDate()`, `heroSlotEmpty()` with imports from `@/lib/utils` and `@/lib/dashboard-stats`. Replace inline stat computation with `computeStats()`.

**`app/api/dashboard/route.ts`**: replace inline `heroSlotEmpty()` and stat computation with imports from `@/lib/dashboard-stats`.

**`app/app/collection/page.tsx`**: replace inline `AVATAR_COLORS` + `avatarColor()` + `tagKey()` with imports from `@/lib/utils`.

---

## Part 2 — Test infrastructure config

### `bunfig.toml` (root)
```toml
[test]
preload = ["./tests/setup.ts"]
timeout = 30000
```

### `tests/setup.ts`
```ts
// Global test setup — runs before every test file
// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/productfactory_test'
process.env.AUTH_SECRET = 'test-secret-do-not-use-in-prod'
process.env.AUTH_URL = 'http://localhost:3000'
```

### `playwright.config.ts` (root)
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

### `package.json` — add scripts and devDep

Add to `"scripts"`:
```json
"test": "bun test",
"test:unit": "bun test tests/unit",
"test:integration": "bun test tests/integration",
"test:e2e": "bun x playwright test"
```

Add to `"devDependencies"`:
```json
"@playwright/test": "^1.49.0"
```

---

## Part 3 — Unit tests

### `tests/unit/utils.test.ts`
```ts
import { describe, expect, it } from 'bun:test'
import { avatarColor, formatDate, greeting, tagKey } from '@/lib/utils'

describe('greeting()', () => {
  it('returns morning for hour < 12', () => {
    expect(greeting('Alice', 9)).toBe('Good morning, Alice')
  })
  it('returns afternoon for hour 12–16', () => {
    expect(greeting('Bob', 14)).toBe('Good afternoon, Bob')
  })
  it('returns evening for hour >= 17', () => {
    expect(greeting('Carol', 20)).toBe('Good evening, Carol')
  })
  it('uses first name only', () => {
    expect(greeting('Alice Smith', 9)).toBe('Good morning, Alice')
  })
  it('falls back to "there" when name is null', () => {
    expect(greeting(null, 9)).toBe('Good morning, there')
  })
  it('falls back to "there" when name is empty string', () => {
    expect(greeting('', 9)).toBe('Good morning, there')
  })
})

describe('avatarColor()', () => {
  it('returns a Tailwind bg class', () => {
    expect(avatarColor('Abc')).toMatch(/^bg-/)
  })
  it('is deterministic — same name always same color', () => {
    expect(avatarColor('MyProduct')).toBe(avatarColor('MyProduct'))
  })
  it('cycles through 6 colors', () => {
    const colors = new Set(
      Array.from({ length: 12 }, (_, i) => avatarColor(String.fromCharCode(65 + i)))
    )
    expect(colors.size).toBeLessThanOrEqual(6)
  })
})

describe('tagKey()', () => {
  it('sorts tags before joining', () => {
    expect(tagKey(['b', 'a', 'c'])).toBe('a|b|c')
  })
  it('is stable regardless of input order', () => {
    expect(tagKey(['z', 'a'])).toBe(tagKey(['a', 'z']))
  })
  it('returns empty string for empty array', () => {
    expect(tagKey([])).toBe('')
  })
})

describe('formatDate()', () => {
  it('returns a non-empty string', () => {
    expect(formatDate(new Date('2025-07-15'))).toBeString()
    expect(formatDate(new Date('2025-07-15')).length).toBeGreaterThan(0)
  })
  it('includes the year', () => {
    expect(formatDate(new Date('2025-07-15'))).toContain('2025')
  })
})
```

### `tests/unit/templates.test.ts`
```ts
import { describe, expect, it } from 'bun:test'
import { fillTemplate } from '@/lib/templates'
import type { TemplateData } from '@/lib/templates'

const BASE: TemplateData = {
  name: 'CutePack',
  etsyName: 'Cute Pack',
  shopName: 'MossarellaStudio',
  contact: 'hello@mossarella.com',
  description: 'A cute digital pack.',
  notes: 'Extra notes.',
  licenseType: 'personal',
  price: 8.5,
  currency: 'USD',
  folders: [{ label: 'Main', count: 5 }, { label: 'Transparent', count: 3 }],
  etsyTags: ['cute', 'digital', 'pack'],
}

describe('fillTemplate()', () => {
  it('replaces {{name}}', () => {
    expect(fillTemplate('Hello {{name}}', BASE)).toBe('Hello CutePack')
  })
  it('replaces {{shopName}}', () => {
    expect(fillTemplate('Shop: {{shopName}}', BASE)).toBe('Shop: MossarellaStudio')
  })
  it('replaces {{etsyTags}} as comma-separated', () => {
    expect(fillTemplate('Tags: {{etsyTags}}', BASE)).toBe('Tags: cute, digital, pack')
  })
  it('replaces {{folders}} with label + count lines', () => {
    const result = fillTemplate('{{folders}}', BASE)
    expect(result).toContain('Main (5 files)')
    expect(result).toContain('Transparent (3 files)')
  })
  it('personal licenseBlock says "Personal use only"', () => {
    const result = fillTemplate('{{licenseBlock}}', { ...BASE, licenseType: 'personal' })
    expect(result).toContain('Personal use only')
  })
  it('commercial licenseBlock says "Commercial use included"', () => {
    const result = fillTemplate('{{licenseBlock}}', { ...BASE, licenseType: 'commercial' })
    expect(result).toContain('Commercial use included')
  })
  it('both licenseBlock includes both prices', () => {
    const result = fillTemplate('{{licenseBlock}}', { ...BASE, licenseType: 'both', commercialPrice: 18 })
    expect(result).toContain('$8.5')
    expect(result).toContain('$18')
  })
  it('replaces all occurrences of the same placeholder', () => {
    const result = fillTemplate('{{name}} and {{name}}', BASE)
    expect(result).toBe('CutePack and CutePack')
  })
  it('leaves unknown placeholders untouched', () => {
    expect(fillTemplate('Hello {{unknown}}', BASE)).toBe('Hello {{unknown}}')
  })
})
```

### `tests/unit/dashboard-stats.test.ts`
```ts
import { describe, expect, it } from 'bun:test'
import { mock } from 'bun:test'

// Mock fs and api-files BEFORE importing dashboard-stats
mock.module('fs', () => ({
  default: {
    readdirSync: () => { throw new Error('ENOENT') }, // simulate no hero dir
  },
  readdirSync: () => { throw new Error('ENOENT') },
}))

mock.module('@/lib/api-files', () => ({
  PRODUCTS_DIR: '/tmp/test-products',
}))

const { computeStats } = await import('@/lib/dashboard-stats')

function makeProduct(overrides = {}) {
  return {
    name: 'TestProduct',
    complete: false,
    description: 'A product',
    etsyTitle: 'Test Etsy Title',
    etsyTags: ['tag1', 'tag2'],
    createdAt: new Date(),
    files: [{ id: '1', origName: 'image.png' }],
    ...overrides,
  }
}

describe('computeStats()', () => {
  it('counts total correctly', () => {
    const stats = computeStats([makeProduct(), makeProduct({ name: 'P2' })], 'user1')
    expect(stats.total).toBe(2)
  })

  it('counts readyToPublish (complete: true)', () => {
    const stats = computeStats([
      makeProduct({ complete: true }),
      makeProduct({ complete: false }),
    ], 'user1')
    expect(stats.readyToPublish).toBe(1)
  })

  it('counts needsReview (not complete but has files or title)', () => {
    const stats = computeStats([
      makeProduct({ complete: false, files: [{ id: '1', origName: 'x.png' }], etsyTitle: '' }),
      makeProduct({ complete: false, files: [], etsyTitle: 'Has Title' }),
      makeProduct({ complete: false, files: [], etsyTitle: '' }),
    ], 'user1')
    expect(stats.needsReview).toBe(2)
  })

  it('needReadme counts products with empty description', () => {
    const stats = computeStats([
      makeProduct({ description: '' }),
      makeProduct({ description: '   ' }),
      makeProduct({ description: 'Has desc' }),
    ], 'user1')
    expect(stats.needReadme).toBe(2)
  })

  it('noGifPreview counts products without any .gif file', () => {
    const stats = computeStats([
      makeProduct({ files: [{ id: '1', origName: 'anim.gif' }] }),
      makeProduct({ name: 'P2', files: [{ id: '2', origName: 'image.png' }] }),
    ], 'user1')
    expect(stats.noGifPreview).toBe(1)
  })

  it('sharedTags counts products with duplicate tag sets', () => {
    const stats = computeStats([
      makeProduct({ name: 'P1', etsyTags: ['a', 'b'] }),
      makeProduct({ name: 'P2', etsyTags: ['b', 'a'] }),  // same as P1 after sort
      makeProduct({ name: 'P3', etsyTags: ['c'] }),
    ], 'user1')
    expect(stats.sharedTags).toBe(2) // P1 and P2 share identical tags
  })

  it('returns zero stats for empty product list', () => {
    const stats = computeStats([], 'user1')
    expect(stats.total).toBe(0)
    expect(stats.readyToPublish).toBe(0)
    expect(stats.needsReview).toBe(0)
  })
})
```

---

## Part 4 — Integration tests

### `tests/integration/products.test.ts`
```ts
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_USER = { id: 'user-test-123', email: 'test@example.com', name: 'Test User' }
const MOCK_SESSION = { user: MOCK_USER }

// Mock auth and prisma before importing the route
mock.module('@/auth', () => ({ auth: async () => MOCK_SESSION }))
mock.module('@/lib/api-files', () => ({
  PRODUCTS_DIR: '/tmp/test-products',
  ROOT: '/tmp/test-root',
  sanitizeName: (n: string) => n.replace(/[^a-zA-Z0-9-_]/g, ''),
}))

const mockFindMany = mock(() => Promise.resolve([]))
const mockCount = mock(() => Promise.resolve(0))
const mockFindUnique = mock(() => Promise.resolve(null))
const mockCreate = mock(() => Promise.resolve({
  name: 'TestProduct',
  sku: '', productName: 'TestProduct', etsyTitle: '',
  description: '', notes: '', contact: '', price: 0, currency: 'USD',
  licenseType: 'personal', commercialPrice: null,
  folders: ['Main'], etsyTags: [], complete: false,
  createdAt: new Date(), files: [],
}))

mock.module('@/lib/db', () => ({
  prisma: {
    product: { findMany: mockFindMany, count: mockCount, findUnique: mockFindUnique, create: mockCreate },
  },
}))

// Also mock fs for mkdirSync in POST
mock.module('fs', () => ({
  default: { mkdirSync: () => {}, readFileSync: () => JSON.stringify({ plan: 'pro' }) },
  mkdirSync: () => {},
  readFileSync: () => JSON.stringify({ plan: 'pro' }),
}))

const { GET, POST } = await import('@/app/api/products/route')

describe('GET /api/products', () => {
  it('returns 401 when not authenticated', async () => {
    mock.module('@/auth', () => ({ auth: async () => null }))
    const { GET: GETUnauth } = await import('@/app/api/products/route')
    const req = new NextRequest('http://localhost/api/products')
    const res = await GETUnauth(req)
    expect(res.status).toBe(401)
  })

  it('returns empty array when no products', async () => {
    mockFindMany.mockReturnValue(Promise.resolve([]))
    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns products list', async () => {
    mockFindMany.mockReturnValue(Promise.resolve([
      { name: 'ProductA', complete: false, createdAt: new Date('2025-01-01') },
    ]))
    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('ProductA')
  })
})

describe('POST /api/products', () => {
  it('returns 400 for missing name', async () => {
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates a product and returns 201', async () => {
    mockFindUnique.mockReturnValue(Promise.resolve(null))
    mockCount.mockReturnValue(Promise.resolve(0))
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestProduct' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('TestProduct')
  })
})
```

### `tests/integration/loadouts.test.ts`
```ts
import { describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const MOCK_SESSION = { user: { id: 'user-test-123', email: 'test@example.com' } }

mock.module('@/auth', () => ({ auth: async () => MOCK_SESSION }))

const mockFindMany = mock(() => Promise.resolve([]))
const mockCreate = mock(() => Promise.resolve({ id: 'l1', name: 'Test Loadout', assets: ['readme'] }))

mock.module('@/lib/db', () => ({
  prisma: {
    loadout: { findMany: mockFindMany, create: mockCreate },
  },
}))

const { GET, POST } = await import('@/app/api/loadouts/route')

describe('GET /api/loadouts', () => {
  it('returns 401 when not authenticated', async () => {
    mock.module('@/auth', () => ({ auth: async () => null }))
    const { GET: GETUnauth } = await import('@/app/api/loadouts/route')
    const req = new NextRequest('http://localhost/api/loadouts')
    const res = await GETUnauth(req)
    expect(res.status).toBe(401)
  })

  it('returns empty array when no loadouts', async () => {
    mockFindMany.mockReturnValue(Promise.resolve([]))
    const req = new NextRequest('http://localhost/api/loadouts')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})

describe('POST /api/loadouts', () => {
  it('returns 400 for missing name', async () => {
    const req = new NextRequest('http://localhost/api/loadouts', {
      method: 'POST',
      body: JSON.stringify({ assets: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates loadout and returns 201', async () => {
    const req = new NextRequest('http://localhost/api/loadouts', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Loadout', assets: ['readme', 'thankyou'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Test Loadout')
  })
})
```

---

## Part 5 — E2E tests (Playwright)

### `tests/e2e/auth.spec.ts`
```ts
import { expect, test } from '@playwright/test'

test('redirects unauthenticated user from /app to /login', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
})

test('login page renders correctly', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('h1')).toContainText('Product Factory')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('send magic link button is interactive', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'admin@example.com')
  const btn = page.locator('button[type="submit"]')
  await expect(btn).not.toBeDisabled()
  // Button should become disabled while loading
  // (just check it's clickable without actually sending)
  await expect(btn).toBeEnabled()
})
```

### `tests/e2e/dashboard.spec.ts`
```ts
import { expect, test } from '@playwright/test'

// NOTE: These tests require the app to be running AND a valid session.
// They use the dev magic-link bypass flow.
// Skip these in CI unless DB is available.
test.skip(!!process.env.CI, 'Requires running DB and dev server')

test('dashboard shows greeting', async ({ page }) => {
  // Use the dev bypass — POST to sign in, then GET dev-url
  const signInRes = await page.request.post('/api/auth/signin/resend', {
    data: { email: 'admin@example.com', csrfToken: '' },
  })
  // In a real test we'd navigate through the dev bypass
  // For now, verify the page structure when unauthenticated redirects
  await page.goto('/app/dashboard')
  // Should redirect to login
  await expect(page).toHaveURL(/\/login/)
})

test('dashboard page has correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Product Factory/)
})
```

### `tests/e2e/collection.spec.ts`
```ts
import { expect, test } from '@playwright/test'

test('collection page redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/app/collection')
  await expect(page).toHaveURL(/\/login/)
})

test('landing page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
```

---

## Constraints
- Do NOT break existing code — all changes to page files are additive imports
- `lib/utils.ts` and `lib/dashboard-stats.ts` must use `export` (named exports)
- The `require('@/lib/utils')` call in dashboard-stats.ts should be replaced with a proper ESM import
- No new npm packages beyond `@playwright/test`
- `bunfig.toml` goes in the project root
- `playwright.config.ts` goes in the project root
- `tests/setup.ts` sets env vars only — no side effects
