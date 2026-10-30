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
      title="Install Diagrams on this device"
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
        ? 'Open it from your Home Screen in its own window, also without internet. The app keeps its own diagrams, so export a diagram file here and import it there. Agents need the desktop app on a computer.'
        : 'Open it from your home screen in its own window, also without internet. It uses the diagrams in this browser. Agents need the desktop app on a computer.'}
    </IntroStrip>
  )
}
