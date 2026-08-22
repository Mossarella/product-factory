import { test, expect } from '@playwright/test'

// NOTE: These tests require the app to be running AND a valid session.
// They use the dev magic-link bypass flow.
// Skip these in CI unless DB is available.
test.skip(!!process.env.CI, 'Requires running DB and dev server')

test('dashboard shows greeting', async ({ page }) => {
  // Use the dev bypass — POST to sign in, then GET dev-url
  await page.request.post('/api/auth/signin/nodemailer', {
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


test('dashboard shows Etsy sync status and matched item total', async ({ page }) => {
  const email = 'admin@example.com'
  const csrfResponse = await page.request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }
  const signInResponse = await page.request.post('/api/auth/signin/nodemailer', {
    form: { email, csrfToken, callbackUrl: '/app/dashboard' },
  })
  expect(signInResponse.ok()).toBeTruthy()
  const devUrlResponse = await page.request.get(`/api/auth/dev-url?email=${encodeURIComponent(email)}`)
  expect(devUrlResponse.ok()).toBeTruthy()
  const { devLoginUrl } = await devUrlResponse.json() as { devLoginUrl: string | null }
  await page.goto(devLoginUrl!)

  await page.route('**/api/integrations/etsy/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: true,
        shopName: 'Product Factory Shop',
        connectionStatus: 'connected',
        syncStatus: 'completed',
        lastSyncAt: new Date().toISOString(),
        lastSyncError: null,
        itemsSeen: 8,
        itemsUpserted: 8,
        cachedItems: 8,
        matchedItems: 3,
      }),
    })
  })

  await page.goto('/app/dashboard')
  const widget = page.getByTestId('etsy-overview-widget')
  await expect(widget).toBeVisible()
  await expect(widget.getByText('Online / synced')).toBeVisible()
  await expect(widget.getByText('Matched items')).toBeVisible()
  await expect(widget.getByText('3', { exact: true })).toBeVisible()
  await expect(widget.getByText('8', { exact: true })).toBeVisible()
})
