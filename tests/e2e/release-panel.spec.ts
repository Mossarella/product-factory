import { expect, test } from '@playwright/test'

const email = process.env.SUPABASE_E2E_EMAIL
const magicLink = process.env.SUPABASE_E2E_MAGIC_LINK

test.describe('live Supabase release panel', () => {
  test.skip(!email || !magicLink, 'Set SUPABASE_E2E_EMAIL and SUPABASE_E2E_MAGIC_LINK to run the authenticated release flow')

  test('finalizes a built package and downloads the sealed release', async ({ page }) => {
    await page.goto('/login?callbackUrl=%2Fapp%2Fcollection')
    await page.getByLabel('Email address').fill(email!)
    await page.getByRole('button', { name: /Send magic link/ }).click()
    await page.goto(magicLink!)
    await page.goto('/app/collection')

    const loadButton = page.getByRole('button', { name: 'Load sample collection' })
    await loadButton.click()
    await expect(page.getByText(/sample products added|already in stock/)).toBeVisible()
    await page.getByRole('button').filter({ hasText: 'Warm Minimalist Wall Art Print' }).click()
    await page.getByRole('link', { name: /Open in Factory/ }).click()

    const buildButton = page.getByRole('button', { name: '📦 Build Product' })
    if (await buildButton.count()) {
      await buildButton.click()
      await expect(page.getByText(/Product v\d+ Ready/)).toBeVisible({ timeout: 30_000 })
    }

    await expect(page.getByText('9. Release', { exact: true })).toBeVisible()
    const finalizeButton = page.getByRole('button', { name: /Finalize v\d+/ })
    if (await finalizeButton.count()) await finalizeButton.click()
    await expect(page.getByText(/CURRENT VERSION RELEASED|Release v\d+ sealed|already exists/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Release history', { exact: true })).toBeVisible()

    const download = page.getByRole('link', { name: 'Download' }).last()
    const downloadPromise = page.waitForEvent('download')
    await download.click()
    const artifact = await downloadPromise
    expect(artifact.suggestedFilename()).toMatch(/Release-v\d+\.zip$/)
  })
})
