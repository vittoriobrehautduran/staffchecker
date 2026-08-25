import { expect, type Page } from '@playwright/test'

export type TestCredentials = {
  email: string
  password: string
}

export function getTestCredentials(): TestCredentials | null {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL?.trim()
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

export function getBossCredentials(): TestCredentials | null {
  const email = process.env.PLAYWRIGHT_TEST_BOSS_EMAIL?.trim()
  const password = process.env.PLAYWRIGHT_TEST_BOSS_PASSWORD || process.env.PLAYWRIGHT_TEST_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

// Log in via email/password form and wait for dashboard.
export async function loginAs(page: Page, credentials: TestCredentials) {
  await page.goto('/login')
  await page.getByLabel('E-post').fill(credentials.email)
  await page.getByLabel('Lösenord').fill(credentials.password)
  await page.getByRole('button', { name: 'Logga in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

export async function expectClubNavVisible(page: Page) {
  const clubLink = page.getByTestId('nav-club')
  await expect(clubLink).toBeVisible({ timeout: 15_000 })
}

export async function openClubPage(page: Page) {
  await page.getByTestId('nav-club').click()
  await page.waitForURL('**/club', { timeout: 15_000 })
}
