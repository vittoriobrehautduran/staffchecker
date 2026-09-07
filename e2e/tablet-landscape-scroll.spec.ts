import { test, expect } from '@playwright/test'
import {
  getBossCredentials,
  getTestCredentials,
  loginAs,
  openClubPage,
} from './helpers/auth'

// Regression for Android tablet landscape: document must be the scroll owner.
// Desktop Chromium + a short landscape viewport is enough to catch the old
// md:h-screen / overflow-hidden trap. Real-device check is still worth one pass.

test.describe('tablet landscape scroll (närvaro)', () => {
  test('app shell does not trap scroll; window can reach the bottom', async ({ page }) => {
    const credentials = getTestCredentials() || getBossCredentials()
    test.skip(!credentials, 'Set PLAYWRIGHT_TEST_EMAIL/PASSWORD or BOSS variants')

    await loginAs(page, credentials!)
    await openClubPage(page)

    const attendanceTab = page.getByTestId('club-tab-attendance')
    if (await attendanceTab.isVisible()) {
      await attendanceTab.click()
    }

    await expect(page.getByTestId('attendance-date-input')).toBeVisible({ timeout: 15_000 })

    const shell = page.getByTestId('app-shell')
    const mainColumn = page.getByTestId('app-main-column')
    await expect(shell).toBeVisible()
    await expect(mainColumn).toBeVisible()

    // Layout contract: no fixed viewport clip / nested scrollport on md+.
    const layout = await page.evaluate(() => {
      const shellEl = document.querySelector('[data-testid="app-shell"]')
      const mainEl = document.querySelector('[data-testid="app-main-column"]')
      if (!(shellEl instanceof HTMLElement) || !(mainEl instanceof HTMLElement)) {
        return null
      }
      const shellStyle = getComputedStyle(shellEl)
      const mainStyle = getComputedStyle(mainEl)
      return {
        shellOverflowY: shellStyle.overflowY,
        shellMaxHeight: shellStyle.maxHeight,
        mainOverflowY: mainStyle.overflowY,
        mainHeight: mainStyle.height,
      }
    })

    expect(layout).not.toBeNull()
    expect(layout!.shellOverflowY).not.toBe('hidden')
    expect(layout!.mainOverflowY).not.toBe('auto')
    expect(layout!.mainOverflowY).not.toBe('scroll')
    // h-screen would compute to a fixed px height equal to the layout viewport.
    expect(layout!.shellMaxHeight).toBe('none')

    // Guarantee overflow so the scroll assertion is meaningful even with sparse data.
    await page.evaluate(() => {
      const main = document.querySelector('[data-testid="app-main-column"]')
      if (!(main instanceof HTMLElement)) return
      const filler = document.createElement('div')
      filler.setAttribute('data-testid', 'scroll-filler')
      filler.style.height = '2500px'
      filler.setAttribute('aria-hidden', 'true')
      main.appendChild(filler)
    })

    const before = await page.evaluate(() => ({
      scrollY: window.scrollY,
      maxScroll: Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      ),
    }))
    expect(before.maxScroll).toBeGreaterThan(400)

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })

    // Document should own scroll and reach the bottom of a tall page.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const maxScroll = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
          )
          return maxScroll === 0 ? 1 : window.scrollY / maxScroll
        })
      )
      .toBeGreaterThan(0.9)

    const after = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollingElementIsDocument:
        document.scrollingElement === document.documentElement ||
        document.scrollingElement === document.body,
    }))

    expect(after.scrollingElementIsDocument).toBe(true)
    expect(after.scrollY).toBeGreaterThan(before.scrollY)
  })
})
