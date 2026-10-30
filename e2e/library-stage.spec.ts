import { expect, test } from '@playwright/test'
import { HEADLINE_FEATURES, MORE_FEATURES } from '@/library/feature-list'

test('pauses and plays the template on the first-run stage', async ({ page }) => {
  await page.goto('/')
  const caption = page.locator('.dg-caption').first()
  await expect(caption).not.toHaveText('', { timeout: 10_000 })
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  await pause.click()
  const held = await caption.textContent()
  await page.waitForTimeout(2500)
  await expect(caption).toHaveText(held!)

  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(caption).not.toHaveText(held!, { timeout: 6000 })
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('waits for Play on the first-run stage when the user asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.dg-caption').first()).not.toHaveText('', { timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('holds the playing template while the tab is in the background', async ({ page }) => {
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (value ? 'hidden' : 'visible'),
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await page.goto('/')
  const caption = page.locator('.dg-caption').first()
  await expect(caption).not.toHaveText('', { timeout: 10_000 })
  await setHidden(true)
  const held = await caption.textContent()
  await page.waitForTimeout(2500)
  await expect(caption).toHaveText(held!)
  await setHidden(false)
  await expect(caption).not.toHaveText(held!, { timeout: 6000 })
})

test('draws the templates on the first visit with the small icon file and no full icon set', async ({ page }) => {
  const iconFiles: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() !== 'fetch') return
    const name = new URL(request.url()).pathname.split('/').pop() ?? ''
    if (name.endsWith('.json')) iconFiles.push(name.replace(/-[\w-]{8}\.json$/, '.json'))
  })
  await page.goto('/')
  await page.getByRole('link', { name: /C4 containers/ }).scrollIntoViewIfNeeded()
  await expect(page.locator('.dg-preview .react-flow__node img').first()).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  expect(new Set(iconFiles)).toEqual(new Set(['templates.json']))
})

test('shows what Diagrams does under the playing template, with pictures from it', async ({ page }) => {
  await page.goto('/')
  const section = page.getByRole('region', { name: 'What Diagrams does' })
  for (const { title } of HEADLINE_FEATURES) await expect(section.getByRole('heading', { name: title })).toBeVisible()
  for (const { title } of MORE_FEATURES) await expect(section.getByText(`${title}.`, { exact: true })).toBeVisible()

  const sectionTop = (await section.boundingBox())!.y
  const moreTemplatesTop = (await page.getByRole('heading', { name: 'More templates' }).boundingBox())!.y
  expect(sectionTop).toBeLessThan(moreTemplatesTop)

  await expect(section.getByLabel('The first steps of the flow above').getByRole('listitem')).toHaveCount(3)
  await expect(section.getByLabel('Operations of the flow above with their latency')).toContainText(' ms')
  const sequence = section.getByLabel('The start of the sequence diagram of the template above')
  await expect(sequence).toContainText('sequenceDiagram')
  await expect(sequence).toContainText('->>')
  await expect(section.getByRole('link', { name: /Set up the action/ })).toHaveAttribute(
    'href',
    /#keep-diagram-images-up-to-date-with-github-actions$/,
  )

  const crossings = page.locator('.dg-preview [data-crossing="true"]')
  await expect(crossings).toHaveCount(0)
  const show = section.getByRole('button', { name: 'Show on the stage' })
  await show.click()
  await expect(section.getByRole('button', { name: 'Hide on the stage' })).toHaveAttribute('aria-pressed', 'true')
  await expect(crossings).not.toHaveCount(0)
  await section.getByRole('button', { name: 'Hide on the stage' }).click()
  await expect(crossings).toHaveCount(0)
})
