import { AxeBuilder } from '@axe-core/playwright'
import { BUILT_IN_THEMES } from '@/themes/built-in'
import { expect, test, type Page } from './fixtures'
import { copyTemplate } from './helpers'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// WCAG 1.4.3 does not apply to text of inactive parts, such as the nodes that Explore dims on purpose.
const DIMMED_IN_EXPLORE = [
  '.dg-canvas[data-exploring] .react-flow__node:not(.dg-explore-near)',
  '.dg-canvas[data-exploring] .react-flow__edge:not(.dg-explore-near)',
]

async function expectNoViolations(page: Page, screen: string) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  for (const selector of DIMMED_IN_EXPLORE) builder = builder.exclude(selector)
  const { violations } = await builder.analyze()
  const found = violations.map(
    (violation) =>
      `${screen}: ${violation.id} (${violation.impact}) ${violation.help} at ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  )
  expect(found).toEqual([])
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce' })

    test('passes the WCAG checks on the library and a template page', async ({ page }) => {
      await page.goto('/')
      await page.locator('.dg-preview .react-flow__node').first().waitFor()
      await expectNoViolations(page, 'library')
      await page.goto('/#/t/order-system')
      await page.locator('.react-flow__node').first().waitFor()
      await expectNoViolations(page, 'template')
    })

    test('passes the WCAG checks in the editor, its menus and dialogs, and Present', async ({ page }) => {
      await page.goto('/')
      await copyTemplate(page, 'Order system')
      await page.locator('.react-flow__node', { hasText: 'Orders' }).first().click()
      await page.getByRole('button', { name: 'Flows' }).click()
      await expectNoViolations(page, 'editor')

      await page.keyboard.press('Control+k')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'command menu')
      await page.keyboard.press('Escape')

      await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
      await page.keyboard.press('n')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'insert menu')
      await page.keyboard.press('Escape')

      await page.keyboard.press('Shift+Slash')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'shortcuts')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Export' }).click()
      await page.getByRole('menuitem', { name: /^Image/ }).click()
      await expect(page.getByAltText('Export preview')).toBeVisible({ timeout: 15_000 })
      await expectNoViolations(page, 'export')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Present' }).click()
      await page.locator('.dg-caption').waitFor()
      await expectNoViolations(page, 'present')
    })

    test('passes the WCAG checks with the minimap and in Explore', async ({ page }) => {
      await page.goto('/')
      await copyTemplate(page, 'Multi-cloud')
      await expect(page.locator('.react-flow__minimap')).toBeVisible()
      await expectNoViolations(page, 'minimap')
      await page.getByRole('button', { name: 'Present' }).click()
      await page.getByRole('button', { name: 'Explore' }).click()
      await expect(page.getByRole('navigation', { name: 'Neighbours' })).toBeVisible()
      await expectNoViolations(page, 'explore')
    })

    test('passes the WCAG checks on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      await page.locator('.dg-preview .react-flow__node').first().waitFor()
      await expectNoViolations(page, 'phone library')
      await copyTemplate(page, 'Order system')
      await expectNoViolations(page, 'phone editor')
    })
  })
}

test.describe('the other built-in themes', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const theme of BUILT_IN_THEMES.filter(({ id }) => id !== 'light' && id !== 'dark')) {
    test(`${theme.name} passes the WCAG checks in the editor and the app settings`, async ({ page }) => {
      await page.addInitScript(
        ({ id, base }) => {
          if (localStorage.getItem('dg:settings')) return
          const themes = { light: 'light', dark: 'dark', [base]: id }
          localStorage.setItem('dg:settings', JSON.stringify({ state: { themeMode: base, themes }, version: 1 }))
        },
        { id: theme.id, base: theme.base },
      )
      await page.goto('/')
      await copyTemplate(page, 'Order system')
      await expect(page.locator('[data-editor-canvas] .dg-canvas')).toHaveAttribute('data-theme', theme.id)
      await page.locator('.react-flow__node', { hasText: 'Orders' }).first().click()
      await expectNoViolations(page, `${theme.name} editor`)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('tab', { name: 'App', exact: true }).click()
      await expectNoViolations(page, `${theme.name} app settings`)
    })
  }
})
