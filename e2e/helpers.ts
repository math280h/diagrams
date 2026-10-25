import { expect, type Page } from '@playwright/test'

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
