import '@fontsource-variable/host-grotesk'
import '@fontsource/fragment-mono/400.css'
import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/atkinson-hyperlegible-mono'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import './styles/canvas.css'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { errorMessage } from '@/lib/error-message'
import { isDesktop } from './desktop/bridge'
import { watchInstallPrompt } from './install/install-prompt'
import { registerServiceWorker } from './install/register-service-worker'
import { bootstrapStorage } from './persistence/bootstrap'
import { router } from './router'
import { StartupError } from './StartupError'

if (!isDesktop()) {
  watchInstallPrompt()
  if (import.meta.env.PROD) registerServiceWorker()
}

let storageError: string | null = null
try {
  await bootstrapStorage()
} catch (error) {
  storageError = errorMessage(error)
}
if (isDesktop()) (await import('./desktop/runtime')).startDesktopRuntime(storageError)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {storageError === null ? <RouterProvider router={router} /> : <StartupError message={storageError} />}
  </StrictMode>,
)
