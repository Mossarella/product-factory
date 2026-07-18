import { test, expect } from '@playwright/test'

// This flow updates the seeded development user, so it needs a real local DB
// and session-capable dev server rather than the CI environment.
test.skip(!!process.env.CI, 'Requires running DB and dev server')

test('updates the sidebar name after saving profile settings', async ({ page }) => {
  const email = 'admin@example.com'

  const csrfResponse = await page.request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }

  const signInResponse = await page.request.post('/api/auth/signin/resend', {
    form: { email, csrfToken, callbackUrl: '/app/dashboard' },
  })
  expect(signInResponse.ok()).toBeTruthy()

  const devUrlResponse = await page.request.get(`/api/auth/dev-url?email=${encodeURIComponent(email)}`)
  expect(devUrlResponse.ok()).toBeTruthy()
  const { devLoginUrl } = await devUrlResponse.json() as { devLoginUrl: string | null }
  expect(devLoginUrl).not.toBeNull()
  await page.goto(devLoginUrl!)

  await expect(page).toHaveURL(/\/app\/dashboard/)

  const avatarMenuTrigger = page.locator('[data-slot="dropdown-menu-trigger"]')
  await avatarMenuTrigger.click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()

  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/app\/settings/)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

  const displayName = page.locator('input:not([type="file"])')
  const originalName = await displayName.inputValue()
  const newName = `${originalName} Test ${Date.now()}`.slice(0, 100)

  await displayName.fill(newName)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible()
  await expect(avatarMenuTrigger).toContainText(newName)

  await displayName.fill(originalName)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible()
  await expect(avatarMenuTrigger).toContainText(originalName)
})
