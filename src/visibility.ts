/** The browser facilities the watcher needs, injectable so the timing rules can be unit-tested. */
export type VisibilityEnv = {
  now: () => number
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { visibilityState?: string }
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
}

/**
 * Calls `refresh` so that changes made on another device show up without a manual reload.
 *
 * - When the tab becomes visible or the window regains focus: at most once per `minGapMs`.
 * - When the browser comes back online: always (the data is likely stale).
 * - Every `pollMs` while the tab is visible, again respecting `minGapMs`.
 * - Never while the tab is hidden.
 *
 * It owns one interval and three listeners; the returned function removes all of them and is safe to call twice.
 */
export function watchVisibleRefresh(refresh: () => void, env: VisibilityEnv, minGapMs = 30_000, pollMs = 300_000): () => void {
  let last = env.now()
  let disposed = false
  const run = (force: boolean) => {
    if (disposed || env.document.visibilityState === 'hidden') return
    const now = env.now()
    if (!force && now - last < minGapMs) return
    last = now
    refresh()
  }
  const onVisible = () => run(false)
  const onOnline = () => run(true)
  const poll = env.setInterval(() => run(false), pollMs)
  env.document.addEventListener('visibilitychange', onVisible)
  env.window.addEventListener('focus', onVisible)
  env.window.addEventListener('online', onOnline)
  return () => {
    if (disposed) return
    disposed = true
    env.clearInterval(poll)
    env.document.removeEventListener('visibilitychange', onVisible)
    env.window.removeEventListener('focus', onVisible)
    env.window.removeEventListener('online', onOnline)
  }
}
