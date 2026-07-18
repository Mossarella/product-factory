import { test, expect } from '@playwright/test'

test('builds a product and exposes its latest download', async ({ page }) => {
  const email = 'admin@example.com'

  const csrfResponse = await page.request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }

  const signInResponse = await page.request.post('/api/auth/signin/resend', {
    form: { email, csrfToken, callbackUrl: '/app/factory' },
  })
  expect(signInResponse.ok()).toBeTruthy()

  const devUrlResponse = await page.request.get(`/api/auth/dev-url?email=${encodeURIComponent(email)}`)
  expect(devUrlResponse.ok()).toBeTruthy()
  const { devLoginUrl } = await devUrlResponse.json() as { devLoginUrl: string | null }
  expect(devLoginUrl).not.toBeNull()
  await page.goto(devLoginUrl!)

  const productName = `Build Product ${Date.now()}`
  const createProductResponse = await page.request.post('/api/products', {
    data: { name: productName },
  })
  expect(createProductResponse.ok()).toBeTruthy()

  await page.goto('/app/factory')
  await page.getByRole('combobox', { name: 'Active product' }).click()
  await page.getByRole('option', { name: new RegExp(productName) }).click()
  await page.getByRole('button', { name: /Build Product/ }).click()

  await expect(page.getByText(/Product v\d+ Ready/)).toBeVisible({ timeout: 15000 })
  const factoryDownload = page.getByRole('link', { name: '⬇ Download ZIP' })
  await expect(factoryDownload).toBeVisible()
  await expect(factoryDownload).toHaveAttribute('href', /\/build\/latest/)

  await page.goto('/app/collection')
  await page.getByRole('button', { name: new RegExp(`^${productName}`) }).click()
  const collectionDownload = page.getByRole('link', { name: '⬇ Download (v1)' })
  await expect(collectionDownload).toBeVisible()
  await expect(collectionDownload).toHaveAttribute('href', /\/build\/latest/)
})
