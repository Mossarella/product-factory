import { test, expect } from '@playwright/test'

test('redirects unauthenticated user from /app to /login', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
})

test('login page renders correctly', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('h1')).toContainText('Product Factory')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('send magic link button is interactive', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'admin@example.com')
  const btn = page.locator('button[type="submit"]')
  await expect(btn).not.toBeDisabled()
  // Button should become disabled while loading
  // (just check it's clickable without actually sending)
  await expect(btn).toBeEnabled()
})
