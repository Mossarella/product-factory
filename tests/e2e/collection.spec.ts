import { test, expect } from '@playwright/test'

test('collection page redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/app/collection')
  await expect(page).toHaveURL(/\/login/)
})

test('landing page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})

test('loads and inspects the sample virtual-stock collection', async ({ page }) => {
  const email = `admin+collection-${Date.now()}@example.com`

  const csrfResponse = await page.request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }
  const signInResponse = await page.request.post('/api/auth/signin/nodemailer', {
    form: { email, csrfToken, callbackUrl: '/app/collection' },
  })
  expect(signInResponse.status()).toBeLessThan(400)
  const devUrlResponse = await page.request.get(`/api/auth/dev-url?email=${encodeURIComponent(email)}`)
  expect(devUrlResponse.ok()).toBeTruthy()
  const { devLoginUrl } = await devUrlResponse.json() as { devLoginUrl: string | null }
  const devUrl = new URL(devLoginUrl!)
  await page.goto(`${devUrl.pathname}${devUrl.search}`)

  await page.goto('/app/collection')
  const loadButton = page.getByRole('button', { name: 'Load sample collection' })
  await loadButton.click()
  await expect(page.getByText(/sample products added/)).toBeVisible()
  const productCard = (name: string) => page.getByRole('button').filter({ hasText: name })
  await expect(productCard('Warm Minimalist Wall Art Print')).toBeVisible()
  await expect(productCard('Quiet Moments Coloring Book')).toBeVisible()
  await expect(productCard('Sunday Reset Weekly Planner')).toBeVisible()
  await expect(productCard('Botanical Wedding Invitation Suite')).toBeVisible()
  await expect(productCard('Studio Launch Social Templates')).toBeVisible()
  await expect(productCard('Little Garden Clipart Bundle')).toBeVisible()
  await expect(page.getByText('WALL ART', { exact: true })).toBeVisible()
  await expect(page.getByText('COLORING BOOK', { exact: true })).toBeVisible()
  await expect(page.getByText('PLANNER', { exact: true })).toBeVisible()
  await expect(page.getByText('WEDDING SUITE', { exact: true })).toBeVisible()
  await expect(page.getByText('SOCIAL KIT', { exact: true })).toBeVisible()
  await expect(page.getByText('CLIPART BUNDLE', { exact: true })).toBeVisible()
  await expect(page.getByText('STOCKED', { exact: true }).first()).toBeVisible()

  await productCard('Warm Minimalist Wall Art Print').click()
  await expect(page.getByText('Pricing & License')).toBeVisible()
  await expect(page.getByText('$8.00')).toBeVisible()
  await expect(page.getByText(/A calm, neutral abstract wall art set/)).toBeVisible()
  await expect(page.getByText('Etsy Listing')).toBeVisible()

  await loadButton.click()
  await expect(page.getByText(/0 sample products added · 6 already in stock/)).toBeVisible()
})

test('duplicates a product from the collection', async ({ page }) => {
  const email = 'admin@example.com'
  const csrfResponse = await page.request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }
  const signInResponse = await page.request.post('/api/auth/signin/nodemailer', {
    form: { email, csrfToken, callbackUrl: '/app/collection' },
  })
  expect(signInResponse.ok()).toBeTruthy()
  const devUrlResponse = await page.request.get(`/api/auth/dev-url?email=${encodeURIComponent(email)}`)
  expect(devUrlResponse.ok()).toBeTruthy()
  const { devLoginUrl } = await devUrlResponse.json() as { devLoginUrl: string | null }
  expect(devLoginUrl).not.toBeNull()
  await page.goto(devLoginUrl!)
  const productName = `Collection Product ${Date.now()}`
  const duplicateName = `Collection Duplicate ${Date.now()}`
  const createProductResponse = await page.request.post('/api/products', {
    data: { name: productName },
  })
  expect(createProductResponse.ok()).toBeTruthy()
  await page.goto('/app/collection')
  await page.getByRole('button', { name: new RegExp(`^${productName}`) }).click()
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await page.getByPlaceholder('New product name').fill(duplicateName)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(duplicateName)
})
