import { useEffect, useRef, useState } from 'react'
import { todayISO } from './lib'
import { watchIstDay } from './midnight'

/**
 * The current Asia/Kolkata date, kept up to date while the page stays open. The timer and
 * listener logic lives in midnight.ts (unit-tested); this effect just subscribes once and
 * unsubscribes on cleanup, so strict-mode double mounts and page changes cannot leak a timer
 * or stack up duplicate listeners.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO())
  useEffect(() => {
    setToday(todayISO())
    return watchIstDay(setToday, {
      now: () => Date.now(),
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number | undefined),
      document,
      window,
    })
  }, [])
  return today
}

/**
 * Calls `refresh` when the tab becomes visible, the window regains focus or the browser comes
 * back online (at most once per `minGapMs`, except for "online"), and every `pollMs` while the
 * tab is visible. This is how a second device's changes appear without a manual reload.
 * The latest `refresh` is read through a ref so the listeners are registered exactly once.
 */
export function useVisibleRefresh(refresh: () => void, minGapMs = 30_000, pollMs = 300_000) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  })
  useEffect(() => {
    let last = Date.now()
    const run = (force: boolean) => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!force && now - last < minGapMs) return
      last = now
      latest.current()
    }
    const onVisible = () => run(false)
    const onOnline = () => run(true)
    const poll = window.setInterval(() => run(false), pollMs)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [minGapMs, pollMs])
}
