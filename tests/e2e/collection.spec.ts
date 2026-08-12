import { test, expect } from '@playwright/test'

test('collection page redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/app/collection')
  await expect(page).toHaveURL(/\/login/)
})

test('landing page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
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
