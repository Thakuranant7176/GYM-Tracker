import test from 'node:test'
import assert from 'node:assert/strict'
import { watchIstDay, type DayWatchEnv } from '../src/midnight'

/** A controllable clock, timer queue and pair of event targets. */
function fakeEnv(startIso: string) {
  let now = Date.parse(startIso)
  let nextHandle = 1
  const timers = new Map<number, { at: number; run: () => void }>()
  const docListeners = new Map<string, Set<() => void>>()
  const winListeners = new Map<string, Set<() => void>>()
  const target = (bucket: Map<string, Set<() => void>>) => ({
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      const set = bucket.get(type) ?? new Set()
      set.add(listener as () => void)
      bucket.set(type, set)
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      bucket.get(type)?.delete(listener as () => void)
    },
  })
  const document = { ...target(docListeners), visibilityState: 'visible' as string }
  const env: DayWatchEnv = {
    now: () => now,
    setTimeout: (run, ms) => {
      const handle = nextHandle++
      timers.set(handle, { at: now + ms, run })
      return handle
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number)
    },
    document,
    window: target(winListeners),
  }
  const count = (bucket: Map<string, Set<() => void>>) => [...bucket.values()].reduce((total, set) => total + set.size, 0)
  return {
    env,
    document,
    timers,
    listenerCount: () => count(docListeners) + count(winListeners),
    /** Advances the clock, firing timers in order as they come due. */
    advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = due[1].at
        due[1].run()
      }
      now = target
    },
    /** Moves the clock without running timers (a laptop that slept). */
    sleepUntil(iso: string) {
      now = Date.parse(iso)
    },
    fire(bucket: 'document' | 'window', type: string) {
      for (const listener of [...((bucket === 'document' ? docListeners : winListeners).get(type) ?? [])]) listener()
    },
  }
}

test('crossing IST midnight notifies exactly once with the new date', () => {
  const clock = fakeEnv('2026-10-30T18:29:00Z') // 23:59:00 IST
  const seen: string[] = []
  const stop = watchIstDay((day) => seen.push(day), clock.env)
  clock.advance(30_000) // 23:59:30
  assert.deepEqual(seen, [])
  clock.advance(60_000) // 00:00:30 IST
  assert.deepEqual(seen, ['2026-10-31'])
  clock.advance(3_600_000)
  assert.deepEqual(seen, ['2026-10-31'])
  stop()
})

test('the watcher re-arms itself and keeps working on later days', () => {
  const clock = fakeEnv('2026-10-30T18:29:00Z')
  const seen: string[] = []
  const stop = watchIstDay((day) => seen.push(day), clock.env)
  clock.advance(86_400_000 * 3)
  assert.deepEqual(seen, ['2026-10-31', '2026-11-01', '2026-11-02'])
  assert.equal(clock.timers.size, 1) // exactly one pending timer, never a pile-up
  stop()
})

test('stopping removes the timer and every listener, and is safe to repeat', () => {
  const clock = fakeEnv('2026-10-30T10:00:00Z')
  const stop = watchIstDay(() => {}, clock.env)
  assert.equal(clock.timers.size, 1)
  assert.equal(clock.listenerCount(), 2)
  stop()
  assert.equal(clock.timers.size, 0)
  assert.equal(clock.listenerCount(), 0)
  stop()
  assert.equal(clock.timers.size, 0)
})

test('two watchers do not interfere, and mount/unmount cycles leave nothing behind', () => {
  const clock = fakeEnv('2026-10-30T10:00:00Z')
  for (let i = 0; i < 5; i += 1) watchIstDay(() => {}, clock.env)()
  assert.equal(clock.timers.size, 0)
  assert.equal(clock.listenerCount(), 0)
  const a = watchIstDay(() => {}, clock.env)
  const b = watchIstDay(() => {}, clock.env)
  assert.equal(clock.listenerCount(), 4)
  a()
  assert.equal(clock.listenerCount(), 2)
  b()
  assert.equal(clock.listenerCount(), 0)
  assert.equal(clock.timers.size, 0)
})

test('after the machine sleeps through midnight, waking the tab catches up and re-arms once', () => {
  const clock = fakeEnv('2026-10-30T10:00:00Z')
  const seen: string[] = []
  const stop = watchIstDay((day) => seen.push(day), clock.env)
  clock.sleepUntil('2026-10-31T05:00:00Z') // timers never ran
  clock.fire('document', 'visibilitychange')
  assert.deepEqual(seen, ['2026-10-31'])
  assert.equal(clock.timers.size, 1) // the stale timer was replaced, not duplicated
  clock.fire('window', 'focus')
  assert.deepEqual(seen, ['2026-10-31']) // same day: no duplicate notification
  assert.equal(clock.timers.size, 1)
  stop()
})

test('a hidden tab does nothing on visibilitychange', () => {
  const clock = fakeEnv('2026-10-30T10:00:00Z')
  const seen: string[] = []
  const stop = watchIstDay((day) => seen.push(day), clock.env)
  clock.sleepUntil('2026-10-31T05:00:00Z')
  clock.document.visibilityState = 'hidden'
  clock.fire('document', 'visibilitychange')
  assert.deepEqual(seen, [])
  stop()
})

test('a timer that fires after stop() does nothing', () => {
  const clock = fakeEnv('2026-10-30T18:29:00Z')
  const seen: string[] = []
  const stop = watchIstDay((day) => seen.push(day), clock.env)
  stop()
  clock.advance(120_000)
  assert.deepEqual(seen, [])
})
