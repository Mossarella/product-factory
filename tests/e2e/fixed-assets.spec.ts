import { test, expect } from '@playwright/test'

// This flow requires the local dev database and dev magic-link bypass.
test.skip(!!process.env.CI, 'Requires running DB and dev server')

test.describe('fixed asset loadouts', () => {
  test('adds, rejects duplicates, removes, and adds multiple custom assets', async ({ page, request }) => {
    // Sign in through the local development magic-link bypass.
    const csrfRes = await request.get('/api/auth/csrf')
    const { csrfToken } = await csrfRes.json()
    await request.post('/api/auth/signin/resend', {
      form: { email: 'admin@example.com', csrfToken, callbackUrl: '/app' },
    })
    const devRes = await request.get('/api/auth/dev-url?email=admin@example.com')
    const { devLoginUrl } = await devRes.json()
    await page.goto(devLoginUrl)

    await page.goto('/app/fixed-assets')
    await page.getByRole('button', { name: '+ New Loadout' }).click()

    const customAssetName = page.getByPlaceholder('Custom asset name')

    // Add a custom asset.
    await customAssetName.fill('Alt Cover Art')
    await page.getByRole('button', { name: '+ Add other' }).click()
    await expect(page.getByText('Alt Cover Art')).toBeVisible()

    // Duplicate names are rejected and the original chip remains singular.
    await customAssetName.fill('Alt Cover Art')
    await page.getByRole('button', { name: '+ Add other' }).click()
    await expect(page.getByText('Already added.')).toBeVisible()
    await expect(page.getByText('Alt Cover Art')).toHaveCount(1)

    // Remove the custom asset.
    await page.getByRole('button', { name: 'Remove Alt Cover Art' }).click()
    await expect(page.getByText('Alt Cover Art')).toHaveCount(0)

    // Multiple distinct custom assets can coexist.
    await customAssetName.fill('Bonus File')
    await page.getByRole('button', { name: '+ Add other' }).click()
    await customAssetName.fill('Sticker Sheet')
    await page.getByRole('button', { name: '+ Add other' }).click()
    await expect(page.getByText('Bonus File')).toBeVisible()
    await expect(page.getByText('Sticker Sheet')).toBeVisible()
  })
})
