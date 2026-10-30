import { devices, expect, test, type Page } from '@playwright/test'

const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'

function withoutBrowserType(device: (typeof devices)[string]) {
  const { defaultBrowserType: _browserType, ...options } = device
  return options
}

const offer = (page: Page) => page.getByRole('region', { name: 'Install Diagrams on this device' })

async function openLibrary(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Keep diagrams with your code' })).toBeAttached()
}

test('serves a web app manifest with the icons that browsers need to install the website', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string
    start_url: string
    display: string
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(manifest).toMatchObject({ name: 'Diagrams', start_url: '/', display: 'standalone' })
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  for (const { src, sizes } of [...manifest.icons, { src: touchIcon!, sizes: '180x180' }]) {
    const size = await page.evaluate(async (url) => {
      const image = new Image()
      image.src = url
      await image.decode()
      return `${image.naturalWidth}x${image.naturalHeight}`
    }, src)
    expect(size, src).toBe(sizes)
  }
})

test.describe('an Android tablet', () => {
  test.use(withoutBrowserType(devices['Galaxy Tab S9']))

  test('offers to install the website, and opens the install prompt of the browser', async ({ page }) => {
    await openLibrary(page)
    await expect(offer(page)).toContainText('Open the browser menu, then choose Install or Add to home screen.')
    await expect(offer(page)).toContainText('It uses the diagrams in this browser.')

    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, {
        prompt: async () => {
          document.documentElement.dataset.installPrompted = 'true'
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      })
      window.dispatchEvent(event)
    })
    await offer(page).getByRole('button', { name: 'Install', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-install-prompted', 'true')
    await expect(offer(page)).toHaveCount(0)
  })

  test('keeps the offer hidden after the user closes it', async ({ page }) => {
    await openLibrary(page)
    await offer(page).getByRole('button', { name: 'Hide the install offer' }).click()
    await expect(offer(page)).toHaveCount(0)
    await page.reload()
    await openLibrary(page)
    await expect(offer(page)).toHaveCount(0)
  })

  test('does not offer to install in the installed app', async ({ page }) => {
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window)
      window.matchMedia = (query) =>
        query === '(display-mode: standalone)'
          ? Object.create(matchMedia(query), { matches: { value: true } })
          : matchMedia(query)
    })
    await openLibrary(page)
    await expect(offer(page)).toHaveCount(0)
  })
})

test.describe('an iPad', () => {
  test.use({ ...withoutBrowserType(devices['iPad (gen 11)']), userAgent: MAC_SAFARI })

  test('explains how to add the website to the Home Screen, and that the app keeps its own diagrams', async ({
    page,
  }) => {
    await openLibrary(page)
    await expect(offer(page)).toContainText('Choose Share, then Add to Home Screen.')
    await expect(offer(page)).toContainText('The app keeps its own diagrams')
  })
})

test.describe('a phone', () => {
  test.use(withoutBrowserType(devices['Pixel 9']))

  test('does not offer to install the website', async ({ page }) => {
    await openLibrary(page)
    await expect(offer(page)).toHaveCount(0)
  })
})

test('offers the desktop app, not the website, on a computer', async ({ page }) => {
  await openLibrary(page)
  await expect(page.getByRole('heading', { name: 'Let an AI agent draw with you' })).toBeVisible()
  await expect(offer(page)).toHaveCount(0)
})
