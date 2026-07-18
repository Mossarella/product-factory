import { test, expect } from '@playwright/test'

test('persists a custom fixed asset', async ({ page }) => {
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

  const productName = `Fixed Asset ${Date.now()}`
  const createProductResponse = await page.request.post('/api/products', {
    data: { name: productName },
  })
  expect(createProductResponse.ok()).toBeTruthy()

  await page.goto('/app/factory')
  await page.getByRole('combobox', { name: 'Active product' }).click()
  await page.getByRole('option', { name: new RegExp(productName) }).click()

  const fixedAssets = page.getByRole('heading', { name: '4. Fixed Assets' }).locator('..')
  const thankYouAsset = fixedAssets.getByText('Thank You card', { exact: true }).locator('xpath=../..')
  await thankYouAsset.locator('input[type="file"]').setInputFiles({
    name: 'custom-thankyou.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  })
  await expect(thankYouAsset).toContainText('✓ loaded')

  await page.getByRole('button', { name: /^Save product/ }).click()
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('combobox', { name: 'Active product' }).click()
  await page.getByRole('option', { name: new RegExp(productName) }).click()
  await expect(thankYouAsset).toContainText('✓ loaded')

  const configResponse = await page.request.get(`/api/products/${encodeURIComponent(productName)}/config`)
  expect(configResponse.ok()).toBeTruthy()
  const config = await configResponse.json() as { fixedAssetFiles: { assetKey: string }[] }
  expect(config.fixedAssetFiles).toEqual(expect.arrayContaining([
    expect.objectContaining({ assetKey: 'thankyou' }),
  ]))
})
