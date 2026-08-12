import { test, expect, type Page } from '@playwright/test'

async function signInFor(page: Page, email: string, callbackUrl: string) {
  const csrfResponse = await page.request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }
  const signInResponse = await page.request.post('/api/auth/signin/nodemailer', {
    form: { email, csrfToken, callbackUrl },
  })
  expect(signInResponse.status()).toBeLessThan(400)
  const devUrlResponse = await page.request.get(`/api/auth/dev-url?email=${encodeURIComponent(email)}`)
  expect(devUrlResponse.ok()).toBeTruthy()
  const { devLoginUrl } = await devUrlResponse.json() as { devLoginUrl: string | null }
  expect(devLoginUrl).not.toBeNull()
  await page.goto(devLoginUrl!)
}

test('dashboard renders through the HUD shell without a server error', async ({ page }) => {
  await signInFor(page, `dashboard-${Date.now()}@example.com`, '/app/dashboard')
  await page.goto('/app/dashboard')
  await expect(page.getByText(/Command deck \/ overview/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Factory →' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Internal Server Error')
})

test('collection detail pane stays inside the viewport on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInFor(page, `overflow-${Date.now()}@example.com`, '/app/collection')
  await page.goto('/app/collection')
  const loadButton = page.getByRole('button', { name: 'Load sample collection' })
  await loadButton.click()
  await expect(page.getByText(/sample products added/)).toBeVisible()
  await page.getByRole('button').filter({ hasText: 'Warm Minimalist Wall Art Print' }).click()
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
})
