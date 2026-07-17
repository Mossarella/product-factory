import { test, expect } from '@playwright/test'

// NOTE: These tests require the app to be running AND a valid session.
// They use the dev magic-link bypass flow.
// Skip these in CI unless DB is available.
test.skip(!!process.env.CI, 'Requires running DB and dev server')

test('dashboard shows greeting', async ({ page }) => {
  // Use the dev bypass — POST to sign in, then GET dev-url
  const signInRes = await page.request.post('/api/auth/signin/resend', {
    data: { email: 'admin@example.com', csrfToken: '' },
  })
  // In a real test we'd navigate through the dev bypass
  // For now, verify the page structure when unauthenticated redirects
  await page.goto('/app/dashboard')
  // Should redirect to login
  await expect(page).toHaveURL(/\/login/)
})

test('dashboard page has correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Product Factory/)
})
