import { test, expect } from '@playwright/test'

test('login page loads with Product Factory heading', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Product Factory' })).toBeVisible()
})

test('login form controls are visible', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByRole('button', { name: /Send magic link/ })).toBeVisible()
})

test('submit button is disabled when email is empty', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Send magic link/ })).toBeDisabled()
})
