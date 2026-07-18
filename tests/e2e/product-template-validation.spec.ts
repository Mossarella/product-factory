import { test, expect } from '@playwright/test'

// This flow requires the local dev database and dev magic-link bypass.
test.skip(!!process.env.CI, 'Requires running DB and dev server')

test('validates a product against required and optional template rules', async ({ page, request }) => {
  // Sign in through the local development magic-link bypass.
  const csrfRes = await request.get('/api/auth/csrf')
  const { csrfToken } = await csrfRes.json() as { csrfToken: string }
  await request.post('/api/auth/signin/resend', {
    form: { email: 'admin@example.com', csrfToken, callbackUrl: '/app' },
  })
  const devRes = await request.get('/api/auth/dev-url?email=admin@example.com')
  const { devLoginUrl } = await devRes.json() as { devLoginUrl: string }
  await page.goto(devLoginUrl)

  const templateName = `Validation template ${Date.now()}`

  await page.goto('/app/product-templates')
  await page.getByRole('button', { name: '+ New Template' }).click()
  await page.locator('input').first().fill(templateName)

  // The first rule defaults to a required variant checklist.
  await page.getByRole('button', { name: '+ Add rule' }).click()
  await page.getByPlaceholder('Rule label, e.g. Expression files').fill('Expression files')
  await page.getByPlaceholder('Folder, e.g. Expressions').fill('Expressions')
  const expectedVariant = page.getByPlaceholder('Add expected variant name')
  await expectedVariant.fill('Happy')
  await expectedVariant.press('Enter')
  await expectedVariant.fill('Sad')
  await expectedVariant.press('Enter')
  await expect(page.getByText('Required', { exact: true })).toBeVisible()

  // Add an optional field rule. Changing its type defaults the field to Description.
  await page.getByRole('button', { name: '+ Add rule' }).click()
  const ruleTypes = page.locator('[data-slot="select-trigger"]')
  await ruleTypes.nth(2).click()
  await page.getByRole('option', { name: 'Field required', exact: true }).click()
  await ruleTypes.nth(3).click()
  await page.getByRole('option', { name: 'Optional', exact: true }).click()
  await page.getByPlaceholder('Rule label, e.g. Expression files').nth(1).fill('Description')
  await expect(ruleTypes.nth(4)).toContainText('Description')

  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/product-templates/')),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ])

  await page.goto('/app/factory')
  const newProduct = page.getByRole('button', { name: '+ New', exact: true })
  if (await newProduct.isEnabled()) {
    await newProduct.click()
    await page.getByPlaceholder('New product name').fill(`Validation product ${Date.now()}`)
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  } else {
    await page.getByRole('combobox', { name: 'Active product' }).click()
    await page.getByRole('option').first().click()
  }

  // A selected existing product may already have a description; make the initial
  // optional-field assertion deterministic.
  await page.getByText('Description', { exact: true }).locator('..').locator('textarea').fill('')

  const templateSelect = page.getByText('Template', { exact: true }).locator('..').locator('[data-slot="select-trigger"]')
  await templateSelect.click()
  await page.getByRole('option', { name: templateName, exact: true }).click()

  await expect(page.getByText('✗ Expression files — Missing: Happy, Sad', { exact: true })).toBeVisible()
  await expect(page.getByText('⚠ Description', { exact: true })).toBeVisible()

  await page.getByText('Description', { exact: true }).locator('..').locator('textarea').fill('A complete product description.')
  await expect(page.getByText('✓ Description', { exact: true })).toBeVisible()
})
