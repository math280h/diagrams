import { Button } from '@/components/ui/button'
import { IntroStrip } from '@/library/IntroStrip'
import { hideInstallIntro, promptInstall, useInstall, useInstallIntroVisible } from './install-prompt'

/** Offers to install the website as an app on tablets, which cannot run the desktop app. */
export function InstallIntro({ className }: { className?: string }) {
  const visible = useInstallIntroVisible()
  const prompt = useInstall((state) => state.prompt)
  if (!visible) return null
  // iPadOS runs a Home Screen web app with its own storage, apart from the browser.
  const apple = /iPad|Macintosh/.test(navigator.userAgent)
  const steps = apple
    ? 'Choose Share, then Add to Home Screen.'
    : 'Open the browser menu, then choose Install or Add to home screen.'
  return (
    <IntroStrip
      headingId="install-intro-heading"
      title="Install this website as an app"
      actions={
        prompt ? (
          <Button variant="secondary" onClick={() => void promptInstall()}>
            Install
          </Button>
        ) : (
          <span className="max-w-60 text-[13px] leading-5 text-muted-foreground">{steps}</span>
        )
      }
      closeLabel="Hide the install offer"
      onClose={hideInstallIntro}
      className={className}
    >
      {apple
        ? 'It opens from your Home Screen in its own window and works without internet. Its diagrams are separate from the ones in this browser. To move one, export it as a file here and import it in the installed app. Agents need the desktop app on a computer.'
        : 'It opens from your home screen in its own window and works without internet. It uses the same diagrams as this browser. Agents need the desktop app on a computer.'}
    </IntroStrip>
  )
}
