import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { copyTemplate } from '../helpers'
import { expect, test } from './fixtures'

test('takes the themes of the themes folder, follows their changes, and copies a theme to a file', async ({
  window,
  dirs,
}) => {
  const themes = path.join(dirs.data, 'themes')
  mkdirSync(themes, { recursive: true })
  writeFileSync(
    path.join(themes, 'brand.theme.json'),
    JSON.stringify({ name: 'Brand', base: 'dark', canvas: { ground: '#101820' }, app: { flow: '#ff7a00' } }),
  )
  await copyTemplate(window, 'Order system')
  await window.getByRole('button', { name: 'Settings', exact: true }).click()
  await window.getByRole('tab', { name: 'App', exact: true }).click()
  await window.getByRole('group', { name: 'Theme mode' }).getByRole('button', { name: 'Dark' }).click()
  const files = window.getByRole('list', { name: 'Theme files' })
  await expect(files.getByRole('listitem')).toHaveText([/Brand/])

  await window.getByRole('combobox', { name: 'Dark theme' }).click()
  await window.getByRole('option', { name: 'Brand' }).click()
  const canvas = window.locator('[data-editor-canvas] .dg-canvas')
  await expect(canvas).toHaveAttribute('data-theme', 'custom:brand')
  await expect(canvas).toHaveCSS('background-color', 'rgb(16, 24, 32)')

  writeFileSync(path.join(themes, 'brand.theme.json'), JSON.stringify({ name: 'Brand', base: 'dark', canvas: { ground: '#203040' } }))
  await expect(canvas).toHaveCSS('background-color', 'rgb(32, 48, 64)')

  await window.getByRole('button', { name: 'Copy Brand as a custom theme' }).click()
  await expect(files.getByRole('listitem')).toHaveText([/Brand/, /Brand copy/])
  const copy = JSON.parse(readFileSync(path.join(themes, 'brand-copy.theme.json'), 'utf8')) as {
    name: string
    canvas: Record<string, string>
  }
  expect(copy.name).toBe('Brand copy')
  expect(copy.canvas.ground).toBe('#203040')
  await expect(canvas).toHaveAttribute('data-theme', 'custom:brand-copy')
})
