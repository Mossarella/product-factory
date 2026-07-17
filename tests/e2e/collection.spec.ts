import { test, expect } from '@playwright/test'

test('collection page redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/app/collection')
  await expect(page).toHaveURL(/\/login/)
})

test('landing page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
