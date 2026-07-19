import { test, expect } from '@playwright/test'

test('deletes a product from the Factory page', async ({ page }) => {
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

  const productName = `Delete Product ${Date.now()}`
  const createProductResponse = await page.request.post('/api/products', {
    data: { name: productName },
  })
  expect(createProductResponse.ok()).toBeTruthy()

  await page.goto('/app/factory')
  await page.getByRole('combobox', { name: 'Active product' }).click()
  await page.getByRole('option', { name: new RegExp(productName) }).click()

  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(new RegExp(`Delete ${productName}\\?`))).toBeVisible()
  await page.getByRole('button', { name: 'Confirm delete' }).click()

  await expect(page.getByRole('combobox', { name: 'Active product' })).not.toHaveText(new RegExp(productName))

  const checkResponse = await page.request.get('/api/products')
  expect(checkResponse.ok()).toBeTruthy()
  const products = await checkResponse.json()
  expect(products.some((p: { name: string }) => p.name === productName)).toBe(false)
})
