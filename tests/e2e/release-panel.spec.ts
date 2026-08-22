import { expect, test, type Page } from '@playwright/test'

const email = process.env.SUPABASE_E2E_EMAIL
const magicLink = process.env.SUPABASE_E2E_MAGIC_LINK

async function signInFor(page: Page, callbackUrl = '/app/collection') {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  await page.getByLabel('Email address').fill(email!)
  await page.getByRole('button', { name: /Send magic link/ }).click()
  await page.goto(magicLink!)
  await expect(page).toHaveURL(new RegExp(callbackUrl.replace('/', '\\/')))
}

async function openSampleFactory(page: Page) {
  await signInFor(page)
  await page.goto('/app/collection')
  const loadButton = page.getByRole('button', { name: 'Load sample collection' })
  if (await loadButton.count()) {
    await loadButton.click()
    await expect(page.getByText(/sample products added|already in stock/)).toBeVisible()
  }
  await page.getByRole('button').filter({ hasText: 'Warm Minimalist Wall Art Print' }).click()
  await page.getByRole('link', { name: /Open in Factory/ }).click()
  await expect(page).toHaveURL(/\/app\/factory/)
  await expect(page.getByText('9. Release', { exact: true })).toBeVisible()
}

async function ensurePackageReady(page: Page) {
  const buildButton = page.getByRole('button', { name: '📦 Build Product' })
  if (await buildButton.count()) {
    await buildButton.click()
    await expect(page.getByText(/Product v\d+ Ready/)).toBeVisible({ timeout: 30_000 })
  }
  await expect(page.getByText(/PACKAGE v\d+ READY/)).toBeVisible({ timeout: 30_000 })
}

function mockReleaseApi(page: Page, options: { postStatus?: number; postBody?: Record<string, unknown> } = {}) {
  let releases: Array<Record<string, unknown>> = []
  return {
    setReleases(next: Array<Record<string, unknown>>) {
      releases = next
    },
    async install() {
      await page.route('**/api/products/*/release', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(releases) })
          return
        }
        await route.fulfill({
          status: options.postStatus ?? 201,
          contentType: 'application/json',
          body: JSON.stringify(options.postBody ?? { release: releases[0], created: true }),
        })
      })
    },
  }
}

test.describe('live Supabase release panel states', () => {
  test.skip(!email || !magicLink, 'Set SUPABASE_E2E_EMAIL and SUPABASE_E2E_MAGIC_LINK to run the authenticated release UI states')

  test('shows Draft when no package has been built', async ({ page }) => {
    const releaseApi = mockReleaseApi(page)
    await releaseApi.install()
    await openSampleFactory(page)

    await expect(page.getByText('NO PACKAGE READY', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Finalize v—', exact: true })).toBeDisabled()
    await expect(page.getByText('Build the product before finalizing a release.')).toBeVisible()
  })

  test('shows Packaged when a build is ready but not released', async ({ page }) => {
    const releaseApi = mockReleaseApi(page)
    await releaseApi.install()
    await openSampleFactory(page)
    await ensurePackageReady(page)

    await expect(page.getByText(/PACKAGE v\d+ READY/)).toBeVisible()
    await expect(page.getByText('Finalize this build to create the Etsy-ready release bundle.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Finalize v\d+/ })).toBeEnabled()
  })

  test('shows Released after the current build is sealed', async ({ page }) => {
    const releaseApi = mockReleaseApi(page)
    await releaseApi.install()
    await openSampleFactory(page)
    await ensurePackageReady(page)

    const packageLabel = page.getByText(/PACKAGE v\d+ READY/)
    const version = Number((await packageLabel.textContent()).match(/\d+/)?.[0])
    releaseApi.setReleases([{
      id: 'release-ui-current',
      version,
      bundle_size: 2048,
      bundle_sha256: 'a'.repeat(64),
      created_at: '2026-08-14T00:00:00.000Z',
    }])
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()

    await expect(page.getByText('✓ CURRENT VERSION RELEASED', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Released v${version}`, exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Download', exact: true })).toBeVisible()
  })

  test('shows Release Failed guidance when finalization returns missing artifacts', async ({ page }) => {
    const releaseApi = mockReleaseApi(page, {
      postStatus: 422,
      postBody: { error: 'Build does not contain release artifacts', code: 'RELEASE_ARTIFACTS_MISSING' },
    })
    await releaseApi.install()
    await openSampleFactory(page)
    await ensurePackageReady(page)

    await page.getByRole('button', { name: /Finalize v\d+/ }).click()

    await expect(page.getByRole('alert')).toContainText('Build this product again to embed release artifacts.')
    await expect(page.getByText(/PACKAGE v\d+ READY/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Finalize v\d+/ })).toBeEnabled()
  })

  test('finalizes a built package and downloads the sealed release', async ({ page }) => {
    await signInFor(page)
    await page.goto('/app/collection')

    const loadButton = page.getByRole('button', { name: 'Load sample collection' })
    if (await loadButton.count()) {
      await loadButton.click()
      await expect(page.getByText(/sample products added|already in stock/)).toBeVisible()
    }
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
