import { test, expect } from '@playwright/test'

test('generates an Etsy description', async ({ page }) => {
  if (!process.env.ANTHROPIC_API_KEY) test.skip(true, 'ANTHROPIC_API_KEY not set in test env')

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

  const productName = `AI Listing ${Date.now()}`
  const createProductResponse = await page.request.post('/api/products', {
    data: { name: productName },
  })
  expect(createProductResponse.ok()).toBeTruthy()

  await page.goto('/app/factory')
  await page.getByRole('combobox', { name: 'Active product' }).click()
  await page.getByRole('option', { name: new RegExp(productName) }).click()

  const preview = page.locator('#etsy-description pre')
  await expect(preview).toHaveText('Generate to preview the Etsy description.')
  await page.getByRole('button', { name: 'Generate Description' }).click()
  await expect(preview).not.toHaveText('Generate to preview the Etsy description.', { timeout: 30_000 })
  await expect(preview).not.toBeEmpty()
})
