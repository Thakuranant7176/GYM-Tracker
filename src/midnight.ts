import { msUntilNextIstMidnight, todayISO } from './lib'

/** The few browser/timer facilities the watcher needs, injectable so it can be tested without a browser. */
export type DayWatchEnv = {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { visibilityState?: string }
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
}

/**
 * Reports the Asia/Kolkata date and every change to it.
 *
 * It owns exactly one timer (armed for the next IST midnight plus a short safety margin and
 * re-armed after it fires) and two listeners (tab becomes visible, window gains focus). The
 * listeners matter because a sleeping laptop or backgrounded phone tab can delay or skip a
 * timer. The returned function removes the timer and both listeners; calling it twice is safe.
 * `onChange` is called only when the date really changes, never twice for the same day.
 */
export function watchIstDay(onChange: (day: string) => void, env: DayWatchEnv, marginMs = 500): () => void {
  let current = todayISO(env.now())
  let timer: unknown
  let disposed = false
  const sync = () => {
    const next = todayISO(env.now())
    if (next !== current) {
      current = next
      onChange(next)
    }
  }
  const arm = () => {
    env.clearTimeout(timer)
    timer = env.setTimeout(() => {
      if (disposed) return
      sync()
      arm()
    }, msUntilNextIstMidnight(env.now()) + marginMs)
  }
  const wake = () => {
    if (disposed || env.document.visibilityState === 'hidden') return
    sync()
    arm()
  }
  arm()
  env.document.addEventListener('visibilitychange', wake)
  env.window.addEventListener('focus', wake)
  return () => {
    if (disposed) return
    disposed = true
    env.clearTimeout(timer)
    env.document.removeEventListener('visibilitychange', wake)
    env.window.removeEventListener('focus', wake)
  }
}
