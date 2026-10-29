import { useSyncExternalStore } from 'react'

interface WindowSize {
  width: number
  height: number
}

let size: WindowSize = { width: 0, height: 0 }

function read(): WindowSize {
  if (size.width !== window.innerWidth || size.height !== window.innerHeight) {
    size = { width: window.innerWidth, height: window.innerHeight }
  }
  return size
}

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

const SERVER_SIZE: WindowSize = { width: 1280, height: 800 }

/** Returns the size of the browser window in CSS pixels, and follows its changes. */
export function useWindowSize(): WindowSize {
  return useSyncExternalStore(subscribe, read, () => SERVER_SIZE)
}
