import { WEBSITE_ORIGIN } from '@/desktop/constants'
import { expect, test } from './fixtures'

test('gives link previews the page title, the description and an image at its stated size', async ({ page }) => {
  await page.goto('/')
  const meta = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).getAttribute('content')
  expect(await meta('og:title')).toBe(await page.title())
  expect(await meta('og:description')).toBe(await meta('description'))
  expect(await meta('og:url')).toBe(`${WEBSITE_ORIGIN}/`)

  const image = new URL((await meta('og:image'))!)
  expect(image.origin).toBe(WEBSITE_ORIGIN)
  const size = await page.evaluate(async (path) => {
    const element = new Image()
    element.src = path
    await element.decode()
    return [element.naturalWidth, element.naturalHeight]
  }, image.pathname)
  expect(size).toEqual([Number(await meta('og:image:width')), Number(await meta('og:image:height'))])
})
