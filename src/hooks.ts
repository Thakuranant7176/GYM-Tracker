import { useEffect, useRef, useState } from 'react'
import { todayISO } from './lib'
import { watchIstDay } from './midnight'
import { watchVisibleRefresh } from './visibility'

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
 * Keeps data fresh across devices: refreshes when the tab is shown again, the window regains focus,
 * the browser reconnects, and every few minutes while visible (rules and cleanup in visibility.ts,
 * which is unit-tested). The latest `refresh` is read through a ref so the listeners are
 * registered exactly once.
 */
export function useVisibleRefresh(refresh: () => void, minGapMs = 30_000, pollMs = 300_000) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  })
  useEffect(
    () =>
      watchVisibleRefresh(
        () => latest.current(),
        {
          now: () => Date.now(),
          setInterval: (callback, ms) => window.setInterval(callback, ms),
          clearInterval: (handle) => window.clearInterval(handle as number | undefined),
          document,
          window,
        },
        minGapMs,
        pollMs,
      ),
    [minGapMs, pollMs],
  )
}
