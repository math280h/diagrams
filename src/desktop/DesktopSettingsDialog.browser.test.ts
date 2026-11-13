import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import '@/index.css'
import { useAppSettings } from './app-settings'
import type { AppSettings, DesktopApi, GitHubSignIn, MainEvents, UpdateInfo } from './contract'
import { DesktopSettingsDialog } from './DesktopSettingsDialog'
import { useGitHubSignIn, watchGitHubSignIn } from './github-sign-in'
import { AGENT_WINDOW_LABEL, KEEP_RUNNING_LABEL, OPEN_AT_LOGIN_LABEL, openAtLoginHint } from './keep-running'
import { useDesktopSettingsDialog } from './settings-dialog'
import { useUpdateInfo } from './updates'

const build = vi.hoisted(() => ({
  website: 'https://draw.thias.dev',
  repository: 'math280h/diagrams',
  repositoryEditable: false,
  githubApp: null as string | null,
}))

vi.mock('./build-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./build-config')>()),
  BUILD: build,
}))

const OFFICIAL = 'https://draw.thias.dev'
const COMPANY = 'https://diagrams.example.com'
const SIGNED_OUT: GitHubSignIn = { state: 'signed-out', message: null }

function settings(websites: string[] = [OFFICIAL], shareWebsite = OFFICIAL): AppSettings {
  return { keepRunning: false, openAtLogin: 'off', agentWindow: 'show', websites, shareWebsite }
}

function updateInfo(patch: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    state: 'idle',
    currentVersion: '1.2.3',
    version: null,
    installsOnQuit: true,
    repository: 'math280h/diagrams',
    message: null,
    ...patch,
  }
}

let answers: Record<string, (input: unknown) => unknown>
const request = vi.fn(async (method: string, input: unknown) => {
  const answer = answers[method]
  if (!answer) throw new Error(`The test has no answer for ${method}.`)
  return answer(input)
})
const listeners = new Map<string, (payload: unknown) => void>()
let root: Root | null = null
let container: HTMLElement | null = null

function show(state: { update?: UpdateInfo; signIn?: GitHubSignIn; app?: AppSettings } = {}) {
  useAppSettings.setState({ settings: state.app ?? settings() })
  useUpdateInfo.setState({ info: state.update ?? updateInfo() })
  useGitHubSignIn.setState({ info: state.signIn ?? SIGNED_OUT })
  useDesktopSettingsDialog.setState({ open: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  root.render(createElement(DesktopSettingsDialog))
}

const signInButton = () => page.getByRole('button', { name: 'Sign in to GitHub' })

const changeRequests = () => request.mock.calls.filter(([method]) => method !== 'app.settings')

beforeEach(() => {
  Object.assign(build, { repositoryEditable: false, githubApp: null })
  answers = { 'app.settings': () => useAppSettings.getState().settings }
  request.mockClear()
  listeners.clear()
  window.desktop = {
    platform: 'win32',
    request,
    on: (name: string, listener: (payload: unknown) => void) => {
      listeners.set(name, listener)
      return () => listeners.delete(name)
    },
  } as unknown as DesktopApi
})

afterEach(() => {
  root?.unmount()
  container?.remove()
  root = null
  container = null
  delete window.desktop
})

describe('websites', () => {
  it('adds a website, keeps the last one, and chooses the website of share links', async () => {
    answers['app.addWebsite'] = () => settings([OFFICIAL, COMPANY])
    answers['app.setShareWebsite'] = (input) => settings([OFFICIAL, COMPANY], (input as { website: string }).website)
    answers['app.removeWebsite'] = () => settings([OFFICIAL], OFFICIAL)
    show()
    await expect.element(page.getByRole('button', { name: `Remove ${OFFICIAL}` })).toBeDisabled()

    const address = page.getByRole('textbox', { name: 'Website address' })
    const add = page.getByRole('button', { name: 'Add', exact: true })
    await address.fill('http://diagrams.example.com')
    await add.click()
    await expect
      .element(page.getByText('Enter a website address that starts with https://, or http:// for this computer.'))
      .toBeVisible()
    await address.fill(OFFICIAL)
    await add.click()
    await expect.element(page.getByText(`${OFFICIAL} is in the list already.`)).toBeVisible()
    expect(changeRequests()).toEqual([])

    await address.fill('diagrams.example.com/#/d/one')
    await add.click()
    await expect.element(page.getByRole('listitem').getByText(COMPANY)).toBeVisible()
    await expect.element(address).toHaveValue('')
    expect(request).toHaveBeenCalledWith('app.addWebsite', { website: COMPANY })

    await page.getByRole('combobox', { name: 'Share links open on' }).click()
    await page.getByRole('option', { name: COMPANY }).click()
    await expect.poll(() => changeRequests().at(-1)).toEqual(['app.setShareWebsite', { website: COMPANY }])

    await page.getByRole('button', { name: `Remove ${COMPANY}` }).click()
    await expect.element(page.getByRole('listitem').getByText(COMPANY)).not.toBeInTheDocument()
    await expect.element(page.getByRole('combobox', { name: 'Share links open on' }).getByText(OFFICIAL)).toBeVisible()
    expect(changeRequests().at(-1)).toEqual(['app.removeWebsite', { website: COMPANY }])
  })
})

describe('background', () => {
  it('changes the keep running setting', async () => {
    answers['app.setKeepRunning'] = (input) => ({ ...settings(), ...(input as object) })
    show()
    await page.getByRole('switch', { name: KEEP_RUNNING_LABEL }).click()
    await expect.element(page.getByRole('switch', { name: KEEP_RUNNING_LABEL })).toBeChecked()
    expect(request).toHaveBeenCalledWith('app.setKeepRunning', { keepRunning: true })
  })

  it('starts the app at sign-in, and shows the state that the system reports', async () => {
    answers['app.setOpenAtLogin'] = () => ({ ...settings(), openAtLogin: 'approval' })
    show()
    const openAtLogin = page.getByRole('switch', { name: OPEN_AT_LOGIN_LABEL })
    await expect.element(openAtLogin).not.toBeChecked()
    await expect.element(page.getByText(openAtLoginHint('off'))).toBeVisible()
    await openAtLogin.click()
    expect(request).toHaveBeenCalledWith('app.setOpenAtLogin', { openAtLogin: true })
    await expect.element(openAtLogin).toBeChecked()
    await expect.element(page.getByText(openAtLoginHint('approval'))).toBeVisible()
  })

  it('loads the sign-in state again when the window gets the focus, after a change in System Settings', async () => {
    show({ app: { ...settings(), openAtLogin: 'approval' } })
    await expect.element(page.getByText(openAtLoginHint('approval'))).toBeVisible()
    answers['app.settings'] = () => ({ ...settings(), openAtLogin: 'on' })
    window.dispatchEvent(new Event('focus'))
    await expect.element(page.getByText(openAtLoginHint('on'))).toBeVisible()
    await expect.element(page.getByRole('switch', { name: OPEN_AT_LOGIN_LABEL })).toBeChecked()
  })

  it('turns off the sign-in switch in a build that cannot start at sign-in', async () => {
    show({ app: { ...settings(), openAtLogin: 'unsupported' } })
    await expect.element(page.getByRole('switch', { name: OPEN_AT_LOGIN_LABEL })).toBeDisabled()
    await expect.element(page.getByText('Only an installed app can start when you sign in.')).toBeVisible()
  })

  it('chooses what the window does when an agent changes a diagram', async () => {
    answers['app.setAgentWindow'] = (input) => ({ ...settings(), ...(input as object) })
    show()
    const agentWindow = page.getByRole('combobox', { name: AGENT_WINDOW_LABEL })
    await expect.element(agentWindow.getByText('Show without focus')).toBeVisible()
    await agentWindow.click()
    await page.getByRole('option', { name: 'Keep closed' }).click()
    await expect.element(agentWindow.getByText('Keep closed')).toBeVisible()
    expect(request).toHaveBeenCalledWith('app.setAgentWindow', { agentWindow: 'hidden' })
  })
})

describe('updates', () => {
  it('shows the first line of the reason why the last check failed', async () => {
    answers['update.check'] = () => updateInfo()
    show({ update: updateInfo({ state: 'failed', message: 'Cannot find latest.yml\nHeaders: {}' }) })
    await expect.element(page.getByText('Cannot find latest.yml')).toBeVisible()
    await expect.element(page.getByText('Headers')).not.toBeInTheDocument()

    await page.getByRole('button', { name: 'Check for updates' }).click()
    await expect.element(page.getByText('Cannot find latest.yml')).not.toBeInTheDocument()
  })

  it('changes the update source of a build that allows it', async () => {
    build.repositoryEditable = true
    answers['update.setRepository'] = () => {
      throw new Error(
        "Error invoking remote method 'update.setRepository': Error: GitHub has no public repository acme/diagrams.",
      )
    }
    show()
    const source = page.getByRole('textbox', { name: 'Update source' })
    const save = page.getByRole('button', { name: 'Save' })
    await source.fill('not a repository')
    await save.click()
    await expect.element(page.getByText('Enter a GitHub repository as owner/name.')).toBeVisible()

    await source.fill('https://github.com/acme/diagrams')
    await save.click()
    await expect.element(page.getByText('GitHub has no public repository acme/diagrams.')).toBeVisible()
    expect(request).toHaveBeenCalledWith('update.setRepository', { repository: 'acme/diagrams' })

    answers['update.setRepository'] = (input) =>
      updateInfo({ repository: (input as { repository: string | null }).repository ?? build.repository })
    await save.click()
    await expect.element(page.getByRole('link', { name: 'acme/diagrams' })).toBeVisible()
    await page.getByRole('button', { name: 'Use math280h/diagrams again' }).click()
    await expect.element(page.getByRole('link', { name: 'math280h/diagrams' })).toBeVisible()
    await expect.element(source).toHaveValue('math280h/diagrams')
    expect(changeRequests().at(-1)).toEqual(['update.setRepository', { repository: null }])
  })
})

describe('GitHub sign-in', () => {
  it('does not show in a build without a GitHub App', async () => {
    show({ update: updateInfo({ state: 'sign-in' }) })
    await expect.element(page.getByRole('button', { name: 'Check for updates' })).toBeVisible()
    await expect.element(signInButton()).not.toBeInTheDocument()

    const stop = watchGitHubSignIn()
    expect(changeRequests()).toEqual([])
    expect(listeners.size).toBe(0)
    stop()
  })

  it('does not show for a public repository or in a build that does not update itself', async () => {
    build.githubApp = 'Iv23liExample'
    show()
    await expect.element(page.getByRole('button', { name: 'Check for updates' })).toBeVisible()
    await expect.element(signInButton()).not.toBeInTheDocument()

    useGitHubSignIn.setState({ info: { state: 'signed-in', kept: true } })
    useUpdateInfo.setState({ info: updateInfo({ state: 'unsupported' }) })
    await expect.element(page.getByText('This build does not update itself.', { exact: false })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('asks for a sign-in when the repository needs one, and shows the code to enter on GitHub', async () => {
    build.githubApp = 'Iv23liExample'
    answers['github.signIn'] = () => ({
      state: 'waiting',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
    })
    answers['github.cancelSignIn'] = () => SIGNED_OUT
    show({ update: updateInfo({ state: 'sign-in' }) })
    await expect
      .element(
        page.getByText('The updates are in a private repository. Sign in to GitHub with an account that can read it.'),
      )
      .toBeVisible()

    await signInButton().click()
    await expect.element(page.getByText('ABCD-1234')).toBeVisible()
    await expect.element(page.getByRole('status')).toHaveTextContent('Waiting for GitHub…')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(signInButton()).toBeVisible()
    expect(changeRequests().map(([method]) => method)).toEqual(['github.signIn', 'github.cancelSignIn'])
  })

  it('offers a sign-in first for an editable update source', async () => {
    build.githubApp = 'Iv23liExample'
    build.repositoryEditable = true
    show({ signIn: { state: 'signed-out', message: 'The code expired. Sign in again.' } })
    await expect
      .element(page.getByText('To get updates from a private repository, sign in to GitHub first.'))
      .toBeVisible()
    await expect.element(page.getByText('The code expired. Sign in again.')).toBeVisible()
    await expect.element(signInButton()).toBeVisible()
  })

  it('signs out, and says when the system keeps the sign-in only until the app quits', async () => {
    build.githubApp = 'Iv23liExample'
    answers['github.signOut'] = () => SIGNED_OUT
    show({ signIn: { state: 'signed-in', kept: false } })
    await expect
      .element(
        page.getByText('Signed in to GitHub until the app quits. This system has no keychain to store the sign-in.'),
      )
      .toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect.element(page.getByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('github.signOut', null)
  })

  it('follows the sign-in of the main process in a build with a GitHub App', async () => {
    build.githubApp = 'Iv23liExample'
    answers['github.info'] = () => ({ state: 'signed-in', kept: true })
    useGitHubSignIn.setState({ info: null })
    const stop = watchGitHubSignIn()
    await expect.poll(() => useGitHubSignIn.getState().info).toEqual({ state: 'signed-in', kept: true })
    const event: MainEvents['github.info'] = SIGNED_OUT
    listeners.get('github.info')?.(event)
    expect(useGitHubSignIn.getState().info).toEqual(SIGNED_OUT)
    stop()
    expect(listeners.size).toBe(0)
  })
})
