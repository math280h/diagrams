import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { AGENT_PORTS, CONNECT_AGENT_LINK } from '@/desktop/constants'
import { copyTemplate, isAgentUrl } from '../helpers'
import { agentUrl, expect, test } from './fixtures'

const WEBSITE_AGENT_URL = agentUrl(AGENT_PORTS[3]!)

test('the website finds the app that received its code on any agent port and hands it the diagram', async ({
  page,
  window,
  dirs,
  agentPort,
  launchWithArgs,
}) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  await page.route(isAgentUrl, (route) =>
    route.request().url().startsWith(WEBSITE_AGENT_URL)
      ? route.continue({ url: route.request().url().replace(WEBSITE_AGENT_URL, agentUrl(agentPort)) })
      : route.abort('connectionrefused'),
  )
  await page.exposeFunction('openDeepLink', (url: string) => launchWithArgs([url]))
  await page.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith('diagrams:')) {
        void (window as unknown as { openDeepLink: (url: string) => Promise<void> }).openDeepLink(this.href)
        return
      }
      HTMLElement.prototype.click.call(this)
    }
  })

  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Open in desktop app' }).click()

  await expect(page.getByText('Opened in Diagrams')).toBeVisible({ timeout: 30_000 })
  await expect(window).toHaveURL(/#\/d\//)
  await expect(window.getByLabel('Diagram name')).toHaveValue('Order system')
  const id = decodeURIComponent(window.url().split('#/d/')[1] ?? '')
  expect(existsSync(path.join(dirs.data, `${id}.diagram.json`))).toBe(true)
  expect(readdirSync(dirs.data)).toHaveLength(1)
})

test('opens the agent setup from the link of the website', async ({ window, launchWithArgs }) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  await launchWithArgs([CONNECT_AGENT_LINK])
  await expect(window.getByRole('dialog', { name: 'Connect an agent' })).toBeVisible()
  await expect(window.getByRole('dialog')).toContainText('claude plugin install')
})
