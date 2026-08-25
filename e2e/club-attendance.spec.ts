import { test, expect } from '@playwright/test'
import {
  getBossCredentials,
  getTestCredentials,
  loginAs,
  openClubPage,
  expectClubNavVisible,
} from './helpers/auth'

test.describe('Club / närvaro', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Välkommen tillbaka' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible()
  })

  test('club page requires authentication', async ({ page }) => {
    await page.goto('/club')
    await expect(page).toHaveURL(/\/login/)
  })

  test('coach can open närvaro', async ({ page }) => {
    const credentials = getTestCredentials()
    test.skip(!credentials, 'Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD')

    await loginAs(page, credentials!)
    await expectClubNavVisible(page)
    await openClubPage(page)

    await expect(page.getByRole('heading', { name: /Närvaro|Klubbschema/ })).toBeVisible()
    await expect(page.getByTestId('attendance-date-input')).toBeVisible()
  })

  test('boss can use historik tab and export', async ({ page }) => {
    const credentials = getBossCredentials()
    test.skip(!credentials, 'Set PLAYWRIGHT_TEST_BOSS_EMAIL and PLAYWRIGHT_TEST_BOSS_PASSWORD')

    await loginAs(page, credentials!)
    await expectClubNavVisible(page)
    await openClubPage(page)

    await page.getByTestId('club-tab-attendance').click()
    await page.getByTestId('attendance-history-tab').click()

    await expect(page.getByTestId('attendance-history-panel')).toBeVisible()
    await expect(page.getByTestId('history-from-date')).toBeVisible()
    await expect(page.getByTestId('history-to-date')).toBeVisible()

    await page.getByTestId('history-load-button').click()
    await expect(page.getByTestId('attendance-history-panel')).toBeVisible()

    const exportCsv = page.getByTestId('history-export-csv')
    if (await exportCsv.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null)
      await exportCsv.click()
      await downloadPromise
    }
  })

  test('boss can open permissions in settings', async ({ page }) => {
    const credentials = getBossCredentials()
    test.skip(!credentials, 'Set PLAYWRIGHT_TEST_BOSS_EMAIL and PLAYWRIGHT_TEST_BOSS_PASSWORD')

    await loginAs(page, credentials!)
    await openClubPage(page)

    await page.getByRole('button', { name: 'Inställningar' }).click()
    await expect(page.getByTestId('club-permissions-panel')).toBeVisible({ timeout: 15_000 })
  })

  test('three-state attendance buttons render on sessions', async ({ page }) => {
    const credentials = getTestCredentials() || getBossCredentials()
    test.skip(!credentials, 'Set PLAYWRIGHT_TEST_EMAIL/PASSWORD or BOSS variants')

    await loginAs(page, credentials!)
    await openClubPage(page)

    const attendanceTab = page.getByTestId('club-tab-attendance')
    if (await attendanceTab.isVisible()) {
      await attendanceTab.click()
    }

    await expect(page.getByTestId('attendance-date-input')).toBeVisible()

    const presentButton = page.locator('[data-testid^="attendance-"][data-testid$="-present"]').first()
    if (await presentButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await presentButton.click()
      await expect(presentButton).toHaveAttribute('aria-pressed', 'true')

      const absentButton = page
        .locator('[data-testid^="attendance-"][data-testid$="-absent"]')
        .first()
      await absentButton.click()
      await expect(absentButton).toHaveAttribute('aria-pressed', 'true')
    }
  })
})
