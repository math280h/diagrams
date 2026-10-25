import { motionValue, type MotionValue } from 'motion'

export interface Clock {
  readonly time: MotionValue<number>
  readonly running: boolean
  advance(deltaMs: number): void
  set(timeMs: number): void
  setRunning(running: boolean): void
}

export function createClock(): Clock {
  const time = motionValue(0)
  let running = true
  return {
    time,
    get running() {
      return running
    },
    advance(deltaMs) {
      if (running) time.set(time.get() + deltaMs)
    },
    set(timeMs) {
      time.set(timeMs)
    },
    setRunning(value) {
      running = value
    },
  }
}
