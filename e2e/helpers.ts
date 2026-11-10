import { expect, type Page } from '@playwright/test'
import { AGENT_HOST, AGENT_PORTS } from '@/desktop/constants'

/** Matches a request to the agent server of a desktop app on any agent port, for `page.route`. */
export function isAgentUrl(url: URL) {
  return url.hostname === AGENT_HOST && AGENT_PORTS.includes(Number(url.port))
}

export async function copyTemplate(page: Page, name: string) {
  await page
    .getByRole('link', { name: new RegExp(name) })
    .last()
    .click()
  await page.getByRole('button', { name: 'Use this template' }).click()
  await expect(page).toHaveURL(/#\/d\//)
  await expect(page.getByLabel('Diagram name')).toBeVisible()
  await expect(page.locator('[data-editor-canvas] .react-flow__node').first()).toBeVisible()
}
