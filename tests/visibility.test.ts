import test from 'node:test'
import assert from 'node:assert/strict'
import { watchVisibleRefresh, type VisibilityEnv } from '../src/visibility'

function fakeEnv() {
  let now = 1_000_000
  let nextHandle = 1
  const intervals = new Map<number, { every: number; next: number; run: () => void }>()
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
  const env: VisibilityEnv = {
    now: () => now,
    setInterval: (run, every) => {
      const handle = nextHandle++
      intervals.set(handle, { every, next: now + every, run })
      return handle
    },
    clearInterval: (handle) => {
      intervals.delete(handle as number)
    },
    document,
    window: target(winListeners),
  }
  const count = (bucket: Map<string, Set<() => void>>) => [...bucket.values()].reduce((total, set) => total + set.size, 0)
  return {
    env,
    document,
    intervals,
    listeners: () => count(docListeners) + count(winListeners),
    advance(ms: number) {
      const target_ = now + ms
      for (;;) {
        const due = [...intervals.values()].filter((interval) => interval.next <= target_).sort((a, b) => a.next - b.next)[0]
        if (!due) break
        now = due.next
        due.next += due.every
        due.run()
      }
      now = target_
    },
    fire(bucket: 'document' | 'window', type: string) {
      for (const listener of [...((bucket === 'document' ? docListeners : winListeners).get(type) ?? [])]) listener()
    },
  }
}

test('showing the tab or focusing the window refreshes, but not more than once per gap', () => {
  const clock = fakeEnv()
  let calls = 0
  const stop = watchVisibleRefresh(() => { calls += 1 }, clock.env, 30_000, 300_000)
  clock.fire('document', 'visibilitychange') // straight away: too soon after setup
  assert.equal(calls, 0)
  clock.advance(31_000)
  clock.fire('document', 'visibilitychange')
  assert.equal(calls, 1)
  clock.fire('window', 'focus') // focus fires right after visibilitychange in real browsers
  assert.equal(calls, 1)
  clock.advance(31_000)
  clock.fire('window', 'focus')
  assert.equal(calls, 2)
  stop()
})

test('coming back online always refreshes, even inside the gap', () => {
  const clock = fakeEnv()
  let calls = 0
  const stop = watchVisibleRefresh(() => { calls += 1 }, clock.env, 30_000, 300_000)
  clock.fire('window', 'online')
  clock.fire('window', 'online')
  assert.equal(calls, 2)
  stop()
})

test('a hidden tab never refreshes, not even when it comes back online', () => {
  const clock = fakeEnv()
  let calls = 0
  const stop = watchVisibleRefresh(() => { calls += 1 }, clock.env, 30_000, 300_000)
  clock.document.visibilityState = 'hidden'
  clock.advance(600_000)
  clock.fire('document', 'visibilitychange')
  clock.fire('window', 'focus')
  clock.fire('window', 'online')
  assert.equal(calls, 0)
  clock.document.visibilityState = 'visible'
  clock.fire('document', 'visibilitychange') // visible again, long since the last refresh
  assert.equal(calls, 1)
  stop()
})

test('the poll refreshes a visible tab every interval', () => {
  const clock = fakeEnv()
  let calls = 0
  const stop = watchVisibleRefresh(() => { calls += 1 }, clock.env, 30_000, 300_000)
  clock.advance(300_000)
  assert.equal(calls, 1)
  clock.advance(300_000)
  assert.equal(calls, 2)
  stop()
})

test('stopping removes the interval and every listener, and is safe to repeat', () => {
  const clock = fakeEnv()
  let calls = 0
  const stop = watchVisibleRefresh(() => { calls += 1 }, clock.env)
  assert.equal(clock.intervals.size, 1)
  assert.equal(clock.listeners(), 3)
  stop()
  stop()
  assert.equal(clock.intervals.size, 0)
  assert.equal(clock.listeners(), 0)
  clock.advance(1_000_000)
  clock.fire('window', 'online')
  assert.equal(calls, 0)
})

test('repeated mount/unmount cycles leave nothing behind', () => {
  const clock = fakeEnv()
  for (let i = 0; i < 6; i += 1) watchVisibleRefresh(() => {}, clock.env)()
  assert.equal(clock.intervals.size, 0)
  assert.equal(clock.listeners(), 0)
})
