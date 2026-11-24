import { createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import '@/index.css'
import { Toaster } from '@/components/ui/sonner'
import { useNoticeOffsets, useNoticesBelow } from './notice-space'

const BAR_TOP_PX = 56
const BAR_HEIGHT_PX = 120

function Bar() {
  const noticesBelow = useNoticesBelow()
  return createElement('div', {
    ref: noticesBelow,
    'data-testid': 'bar',
    style: { position: 'fixed', top: BAR_TOP_PX, left: 0, right: 0, height: BAR_HEIGHT_PX },
  })
}

function App({ bar }: { bar: boolean }) {
  const { offset, mobileOffset } = useNoticeOffsets()
  return createElement(
    Fragment,
    null,
    bar && createElement(Bar),
    createElement(Toaster, { position: 'top-center', offset, mobileOffset }),
  )
}

let root: Root | null = null

afterEach(() => {
  toast.dismiss()
  root?.unmount()
  root = null
  document.body.replaceChildren()
})

async function noticeTop() {
  const notice = page.getByText('Saved somewhere else')
  await expect.element(notice).toBeVisible()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return document.querySelector('[data-sonner-toast]')!.getBoundingClientRect().top
}

describe('notices and bars at the top of the window', () => {
  it('shows notices below a bar while it shows, and at the usual place after', async () => {
    await page.viewport(1200, 700)
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    root.render(createElement(App, { bar: true }))
    toast.error('Saved somewhere else', { duration: Infinity })
    expect(await noticeTop()).toBeGreaterThanOrEqual(BAR_TOP_PX + BAR_HEIGHT_PX)

    root.render(createElement(App, { bar: false }))
    await expect
      .poll(() => document.querySelector('[data-sonner-toast]')!.getBoundingClientRect().top)
      .toBeLessThan(BAR_TOP_PX + BAR_HEIGHT_PX)
  })
})
