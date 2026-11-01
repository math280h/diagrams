import { expect, test } from './fixtures'

const RELEASES = 'https://api.github.com/repos/math280h/diagrams/releases?per_page=30'

test('shows the notes of the published releases', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.route(RELEASES, (route) =>
    route.fulfill({
      json: [
        {
          tag_name: 'v0.2.0',
          name: 'v0.2.0',
          published_at: '2026-10-28T09:00:00Z',
          html_url: 'https://github.com/math280h/diagrams/releases/tag/v0.2.0',
          body_html:
            '<h2>What\'s Changed</h2><ul><li>Play a trace as a flow in <a href="/math280h/diagrams/pull/14">#14</a></li></ul><img src=x onerror="alert(1)">',
        },
        {
          tag_name: 'v0.2.0-beta.1',
          prerelease: true,
          published_at: '2026-10-27T09:00:00Z',
          body_html: '<p>Preview</p>',
        },
        {
          tag_name: 'v0.1.1',
          name: 'v0.1.1',
          published_at: '2026-10-20T09:00:00Z',
          html_url: 'https://github.com/math280h/diagrams/releases/tag/v0.1.1',
          body_html: '',
        },
      ],
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'What’s new' }).click()
  await expect(page).toHaveURL(/#\/releases$/)

  const latest = page.getByRole('article', { name: 'v0.2.0' })
  await expect(latest.getByRole('heading', { name: "What's Changed" })).toBeVisible()
  await expect(latest.getByRole('link', { name: '#14' })).toHaveAttribute(
    'href',
    'https://github.com/math280h/diagrams/pull/14',
  )
  await expect(page.getByRole('article', { name: 'v0.1.1' })).toContainText('This release has no notes.')
  await expect(page.getByText('Preview')).toHaveCount(0)
  expect(dialogs).toEqual([])

  await page.getByRole('button', { name: 'All diagrams' }).click()
  await expect(page).toHaveURL(/#\/$/)
})

test('links to GitHub when the release notes cannot be loaded', async ({ page }) => {
  await page.route(RELEASES, (route) => route.fulfill({ status: 403, json: { message: 'API rate limit exceeded' } }))
  await page.goto('/#/releases')
  await expect(page.getByText('The release notes could not be loaded. GitHub answered with status 403.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Read them on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/math280h/diagrams/releases',
  )
})
