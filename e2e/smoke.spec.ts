import { expect, test, type Page } from '@playwright/test'

/**
 * Fumo: ogni rotta pubblica si apre senza errori JavaScript e senza scroll orizzontale a 400 px.
 * Gira sulla build di produzione (vite preview) in modalità demo.
 */
const PUBLIC_ROUTES = ['/', '/locale/v_giglio', '/segnala', '/accedi', '/ditte', '/trasparenza', '/nas', '/come-funziona', '/regole', '/termini', '/privacy', '/dsa']

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/tile\.openstreetmap|net::ERR|Failed to load resource/i.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

for (const route of PUBLIC_ROUTES) {
  test(`route ${route} renders cleanly`, async ({ page }) => {
    const errors = await collectErrors(page)
    await page.goto(`/#${route}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(600)
    await expect(page.locator('#root')).not.toBeEmpty()
    const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(clientWidth + 1)
    const raw = await page.locator('body').innerText()
    expect(raw, `untranslated i18n key on ${route}`).not.toMatch(/\b(map|report|venue|company|moderation|legal|auth|transparency|manage|nas|common|status|rule)\.[a-z_]+\.[a-z_]+\b/)
    expect(errors, `errors on ${route}`).toEqual([])
  })
}

test('demo sign-in as moderator opens the moderation console', async ({ page }) => {
  await page.goto('/#/accedi')
  await page.getByText(/Chiara/).first().click()
  await page.waitForURL(/moderazione/)
  await expect(page.locator('#root')).toContainText(/moderazion/i)
})
