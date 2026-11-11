import { create } from 'zustand'
import { reportError } from '@/store/problem-store'
import { desktopApi } from './bridge'
import { BUILD } from './build-config'
import type { GitHubSignIn } from './contract'

export const useGitHubSignIn = create<{ info: GitHubSignIn | null }>(() => ({ info: null }))

/** Follows the GitHub sign-in of the main process, in a build with a GitHub App. */
export function watchGitHubSignIn(): () => void {
  const desktop = desktopApi()
  if (!desktop || !BUILD.githubApp) return () => undefined
  void desktop.request('github.info', null).then(
    (info) => useGitHubSignIn.setState({ info }),
    () => undefined,
  )
  return desktop.on('github.info', (info) => useGitHubSignIn.setState({ info }))
}

async function request(method: 'github.signIn' | 'github.cancelSignIn' | 'github.signOut', title: string) {
  const desktop = desktopApi()
  if (!desktop) return
  try {
    useGitHubSignIn.setState({ info: await desktop.request(method, null) })
  } catch (error) {
    reportError(title, error)
  }
}

export function signInToGitHub() {
  return request('github.signIn', 'Could not start the GitHub sign-in')
}

export function cancelGitHubSignIn() {
  return request('github.cancelSignIn', 'Could not cancel the GitHub sign-in')
}

export function signOutOfGitHub() {
  return request('github.signOut', 'Could not sign out of GitHub')
}
