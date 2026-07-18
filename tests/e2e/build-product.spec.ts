import { test, expect, type Locator } from '@playwright/test'

function versionCard(history: Locator, version: number) {
  return history
    .getByText(new RegExp(`^v${version}(?:Current)?$`))
    .locator('..')
    .locator('..')
    .locator('..')
}

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
  await page.getByPlaceholder('Search…').fill(productName)
  await page.getByText(productName, { exact: true }).locator('..').click()
  const collectionDownload = page.getByRole('link', { name: '⬇ Download (v1)' })
  await expect(collectionDownload).toBeVisible()
  await expect(collectionDownload).toHaveAttribute('href', /\/build\/latest/)
})

test('shows version history with changelog and supports revert and per-version download', async ({ page }) => {
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

  const productName = `Version History ${Date.now()}`
  const createProductResponse = await page.request.post('/api/products', {
    data: { name: productName },
  })
  expect(createProductResponse.ok()).toBeTruthy()

  await page.goto('/app/factory')
  await page.getByRole('combobox', { name: 'Active product' }).click()
  await page.getByRole('option', { name: new RegExp(productName) }).click()
  await page.getByRole('button', { name: /Build Product/ }).click()
  await expect(page.getByText(/Product v\d+ Ready/)).toBeVisible({ timeout: 15000 })

  await page.getByPlaceholder('What changed? (optional)').fill('Second pass')
  await page.getByRole('button', { name: /Build Product/ }).click()
  await expect(page.getByText(/Product v\d+ Ready/)).toBeVisible({ timeout: 15000 })

  const factoryHistory = page.getByText('8. Version History', { exact: true }).locator('..')
  const factoryV1 = versionCard(factoryHistory, 1)
  const factoryV2 = versionCard(factoryHistory, 2)
  await expect(factoryV1).toBeVisible()
  await expect(factoryV2).toBeVisible()
  await expect(factoryV2.getByText('Current', { exact: true })).toBeVisible()
  await expect(factoryV2.getByText('Second pass', { exact: true })).toBeVisible()
  await expect(factoryV1.getByRole('button', { name: '↩ Revert' })).toBeEnabled()
  await expect(factoryV2.getByRole('button', { name: '↩ Revert' })).toBeDisabled()

  await factoryV1.getByRole('button', { name: '↩ Revert' }).click()
  await expect(page.getByText('Reverted to v1', { exact: true })).toBeVisible()
  const factoryV3 = versionCard(factoryHistory, 3)
  await expect(factoryV3.getByText('Current', { exact: true })).toBeVisible()

  await page.goto('/app/collection')
  await page.getByPlaceholder('Search…').fill(productName)
  await page.getByText(productName, { exact: true }).locator('..').click()
  const collectionHistory = page.getByText('Version History', { exact: true }).locator('..')
  await expect(collectionHistory.getByText('v1', { exact: true })).toBeVisible()
  await expect(collectionHistory.getByText('v2', { exact: true })).toBeVisible()
  const collectionV1 = versionCard(collectionHistory, 1)
  const collectionV2 = versionCard(collectionHistory, 2)
  const collectionV3 = versionCard(collectionHistory, 3)
  await expect(collectionV1.getByRole('link', { name: '⬇ Download' })).toBeVisible()
  await expect(collectionV2.getByRole('link', { name: '⬇ Download' })).toBeVisible()
  await expect(collectionV3.getByRole('link', { name: '⬇ Download' })).toBeVisible()
  await expect(collectionV3.getByRole('link', { name: '⬇ Download' })).toHaveAttribute('href', /\/build\/3/)
  await expect(collectionHistory.getByRole('link', { name: '⬇ Download' })).toHaveCount(3)
})
