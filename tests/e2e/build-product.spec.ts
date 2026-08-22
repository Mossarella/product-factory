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

  const signInResponse = await page.request.post('/api/auth/signin/nodemailer', {
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

  const signInResponse = await page.request.post('/api/auth/signin/nodemailer', {
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

  const factoryVersion = page.getByRole('combobox', { name: 'Version' })
  const factoryHistory = factoryVersion.locator('xpath=../../..')
  await factoryVersion.click()
  await expect(page.getByRole('option')).toHaveCount(2)
  await expect(page.getByRole('option', { name: /v2.*Current/ })).toBeVisible()

  await page.getByRole('option', { name: /v1/ }).click()
  await expect(factoryHistory.getByText('Initial build', { exact: true })).toBeVisible()
  const revert = page.getByRole('button', { name: '↩ Revert' })
  await expect(revert).toBeEnabled()

  await factoryVersion.click()
  await page.getByRole('option', { name: /v2.*Current/ }).click()
  await expect(factoryHistory.getByText('Second pass', { exact: true })).toBeVisible()
  await expect(revert).toBeDisabled()

  await factoryVersion.click()
  await page.getByRole('option', { name: /v1/ }).click()
  await revert.click()
  await expect(factoryHistory.getByText('Reverted to v1', { exact: true })).toBeVisible()
  await factoryVersion.click()
  await expect(page.getByRole('option')).toHaveCount(3)
  await expect(page.getByRole('option', { name: /v3.*Current/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/app/collection')
  await page.getByPlaceholder('Search…').fill(productName)
  await page.getByText(productName, { exact: true }).locator('..').click()
  const collectionVersion = page.getByRole('combobox', { name: 'Version' })
  const collectionDownload = page.getByRole('link', { name: '⬇ Download', exact: true })

  await collectionVersion.click()
  await expect(page.getByRole('option')).toHaveCount(3)
  await page.getByRole('option', { name: /v3.*Current/ }).click()
  await expect(collectionDownload).toHaveAttribute('href', /\/build\/3/)

  await collectionVersion.click()
  await page.getByRole('option', { name: /v1/ }).click()
  await expect(collectionDownload).toHaveAttribute('href', /\/build\/1/)
})
