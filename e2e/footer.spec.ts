import { BUILD_RELEASES } from '@/desktop/build-config'
import { REPOSITORY_URL } from '@/desktop/constants'
import { expect, test } from './fixtures'

test('links the releases, the source code and the legal texts in the website footer', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('footer')
  const link = (name: string) => footer.getByRole('link', { name, exact: true })
  await expect(link('Get the desktop app')).toHaveAttribute('href', BUILD_RELEASES.latestRelease)
  await expect(link('Source code on GitHub')).toHaveAttribute('href', REPOSITORY_URL)
  await expect(link('Source code on GitHub')).toHaveAttribute('target', '_blank')
  await expect(link('Report a problem')).toHaveAttribute('href', `${REPOSITORY_URL}/issues/new/choose`)
  await expect(link('Security policy')).toHaveAttribute('href', `${REPOSITORY_URL}/security/policy`)
  await expect(link('Release signing key')).toHaveAttribute('href', '/release-signing-key.asc')
  await expect(link('Release signing key')).not.toHaveAttribute('target')
  await expect(link('MIT licence')).toHaveAttribute('href', `${REPOSITORY_URL}/blob/main/LICENSE`)
  await expect(link('Third-party licences')).toHaveAttribute('href', '/third-party-licenses.txt')

  await footer.getByRole('button', { name: 'Problem reports' }).click()
  await expect(page.getByRole('dialog', { name: 'Problem reports' })).toBeVisible()
  await page.keyboard.press('Escape')

  await link('What’s new').click()
  await expect(page).toHaveURL(/#\/releases$/)
})
