import { test, expect } from '@playwright/test'

const email = process.env.SUPABASE_E2E_EMAIL
const magicLink = process.env.SUPABASE_E2E_MAGIC_LINK

test.describe('live Supabase product packaging', () => {
  test.skip(!email || !magicLink, 'Set SUPABASE_E2E_EMAIL and SUPABASE_E2E_MAGIC_LINK to run against live Supabase auth')

  test('authenticates, loads a sample product, builds it, and downloads the ZIP', async ({ page }) => {
    await page.goto('/login?callbackUrl=%2Fapp%2Fcollection')
    await expect(page.getByRole('heading', { name: 'Product Factory' })).toBeVisible()

    await page.getByLabel('Email address').fill(email!)
    await page.getByRole('button', { name: /Send magic link/ }).click()
    await expect(page.getByText('Check your email')).toBeVisible()

    await page.goto(magicLink!)
    await expect(page).toHaveURL(/\/app\/collection/)
    await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible()

    const loadButton = page.getByRole('button', { name: 'Load sample collection' })
    await loadButton.click()
    await expect(page.getByText(/sample products added|already in stock/)).toBeVisible()

    await page.getByRole('button').filter({ hasText: 'Warm Minimalist Wall Art Print' }).click()
    await page.getByRole('link', { name: /Open in Factory/ }).click()
    await expect(page).toHaveURL(/\/app\/factory/)
    await expect(page.getByText('7. Build', { exact: true })).toBeVisible()

    const buildButton = page.getByRole('button', { name: '📦 Build Product' })
    await buildButton.click()
    await expect(page.getByText(/Product v\d+ Ready/)).toBeVisible({ timeout: 30_000 })

    const downloadLink = page.getByRole('link', { name: '⬇ Download ZIP' })
    const downloadPromise = page.waitForEvent('download')
    await downloadLink.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/Pack-v?\d*\.zip$/)

    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    const fs = await import('node:fs/promises')
    const stat = await fs.stat(downloadPath!)
    expect(stat.size).toBeGreaterThan(100)
  })
})
