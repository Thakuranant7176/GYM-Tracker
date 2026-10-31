import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearDraft,
  describeActiveSession,
  draftStorageKey,
  findActiveSession,
  isActiveSession,
  isCompletedSession,
  loadDraft,
  saveDraft,
  sessionDateFor,
  whyWorkoutEnded,
  type StorageLike,
} from '../src/workoutLifecycle'
import { USER, plan, workout } from './fixtures'

const memoryStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

test('status decides completion; pre-migration rows fall back to the legacy flag', () => {
  assert.equal(isCompletedSession(workout({ session_date: '2026-10-30', status: 'completed' })), true)
  assert.equal(isCompletedSession(workout({ session_date: '2026-10-30', status: 'in_progress' })), false)
  assert.equal(isCompletedSession(workout({ session_date: '2026-10-30', status: 'discarded' })), false)
  assert.equal(isCompletedSession({ status: undefined, completed: true } as never), true)
  assert.equal(isCompletedSession({ status: undefined, completed: false } as never), false)
  assert.equal(isActiveSession({ status: 'in_progress' }), true)
  assert.equal(isActiveSession({ status: 'completed' }), false)
})

test('the active session comes only from database rows (refresh restores it)', () => {
  const rows = [workout({ session_date: '2026-10-29' }), workout({ session_date: '2026-10-30', status: 'in_progress', title: 'Pull' }), workout({ session_date: '2026-10-28', status: 'discarded' })]
  assert.equal(findActiveSession(rows)?.title, 'Pull')
  assert.equal(findActiveSession([]), null)
  assert.equal(findActiveSession(rows.filter((row) => row.status !== 'in_progress')), null)
})

test('if several active rows ever exist, every device picks the same one (the newest)', () => {
  const older = workout({ session_date: '2026-10-29', status: 'in_progress', started_at: '2026-10-29T05:00:00Z', title: 'older' })
  const newer = workout({ session_date: '2026-10-30', status: 'in_progress', started_at: '2026-10-30T05:00:00Z', title: 'newer' })
  assert.equal(findActiveSession([older, newer])?.title, 'newer')
  assert.equal(findActiveSession([newer, older])?.title, 'newer')
})

test('start -> discard -> start again: once the old session is discarded a new one can take the slot', () => {
  // The database enforces the one-active rule; the client simply reflects the rows it loads.
  let rows = [workout({ session_date: '2026-10-30', status: 'in_progress', title: 'Push' })]
  assert.equal(findActiveSession(rows)?.title, 'Push')
  rows = rows.map((row) => ({ ...row, status: 'discarded' as const, completed: false }))
  assert.equal(findActiveSession(rows), null)
  rows = [...rows, workout({ session_date: '2026-10-30', status: 'in_progress', title: 'Pull' })]
  assert.equal(findActiveSession(rows)?.title, 'Pull')
  assert.equal(rows.filter(isActiveSession).length, 1)
  assert.equal(rows.filter((row) => row.status === 'discarded').length, 1) // history kept, not deleted
})

test('completing frees the slot and the session becomes history', () => {
  const rows = [workout({ session_date: '2026-10-30', status: 'completed' })]
  assert.equal(findActiveSession(rows), null)
  assert.equal(rows.filter(isCompletedSession).length, 1)
})

test('why a workout ended elsewhere', () => {
  const done = workout({ session_date: '2026-10-30', status: 'completed' })
  const dropped = workout({ session_date: '2026-10-30', status: 'discarded' })
  assert.equal(whyWorkoutEnded(done.id, [done, dropped]), 'completed')
  assert.equal(whyWorkoutEnded(dropped.id, [done, dropped]), 'discarded')
  assert.equal(whyWorkoutEnded('gone', [done, dropped]), 'missing')
})

test('a session left open past midnight is flagged, not silently changed', () => {
  const plans = [plan({ id: 'p-fri', weekday: 5 }), plan({ id: 'p-sat', weekday: 6, name: 'Legs' })]
  const stale = workout({ session_date: '2026-10-30', status: 'in_progress', workout_plan_id: 'p-fri', started_at: '2026-10-30T14:00:00Z' })
  // Saturday 31 Oct, 10:00 IST (04:30 UTC): the Friday session is still open.
  const notice = describeActiveSession(stale, '2026-10-31', plans, 6, Date.parse('2026-10-31T04:30:00Z'))
  assert.equal(notice.startedOnEarlierDay, true)
  assert.equal(notice.needsAttention, true)
  assert.equal(notice.differsFromTodaysRoutine, true)
  assert.equal(notice.hoursOpen, 14)
  assert.equal(stale.status, 'in_progress') // describing never modifies it
})

test('a fresh same-day session needs no warning; a long-open one does', () => {
  const plans = [plan({ id: 'p-fri', weekday: 5 })]
  const fresh = workout({ session_date: '2026-10-30', status: 'in_progress', workout_plan_id: 'p-fri', started_at: '2026-10-30T04:00:00Z' })
  assert.equal(describeActiveSession(fresh, '2026-10-30', plans, 5, Date.parse('2026-10-30T05:00:00Z')).needsAttention, false)
  assert.equal(describeActiveSession(fresh, '2026-10-30', plans, 5, Date.parse('2026-10-30T05:00:00Z')).differsFromTodaysRoutine, false)
  assert.equal(describeActiveSession(fresh, '2026-10-30', plans, 5, Date.parse('2026-10-30T11:00:00Z')).needsAttention, true)
})

test('the date a new session is filed under: explicit calendar date, else the current IST date', () => {
  assert.equal(sessionDateFor('2026-10-12'), '2026-10-12')
  assert.equal(sessionDateFor(null, Date.parse('2026-10-30T18:29:59Z')), '2026-10-30')
  assert.equal(sessionDateFor(null, Date.parse('2026-10-30T18:30:00Z')), '2026-10-31') // page opened before midnight, used after
  assert.equal(sessionDateFor(undefined, Date.parse('2026-10-30T18:30:00Z')), '2026-10-31')
})

test('drafts are only trusted for the session the database says is active', () => {
  const storage = memoryStorage()
  saveDraft(storage, USER, 'session-A', [{ key: 'a', reps: 8 }], 'felt strong', new Date('2026-10-30T05:00:00Z'))
  assert.deepEqual(loadDraft(storage, USER, 'session-A')?.drafts, [{ key: 'a', reps: 8 }])
  assert.equal(loadDraft(storage, USER, 'session-A')?.notes, 'felt strong')
  assert.equal(loadDraft(storage, USER, 'session-B'), null) // a different session never inherits it
  assert.equal(loadDraft(storage, 'another-user', 'session-A'), null) // keyed per user
})

test('corrupt, malformed or missing drafts are ignored safely', () => {
  const storage = memoryStorage()
  assert.equal(loadDraft(storage, USER, 'x'), null)
  storage.setItem(draftStorageKey(USER), '{not json')
  assert.equal(loadDraft(storage, USER, 'x'), null)
  storage.setItem(draftStorageKey(USER), JSON.stringify({ sessionId: 'x', drafts: 'nope' }))
  assert.equal(loadDraft(storage, USER, 'x'), null)
  assert.equal(loadDraft(null, USER, 'x'), null)
})

test('clearing a draft and a storage that throws never break the workout', () => {
  const storage = memoryStorage()
  saveDraft(storage, USER, 'x', [], '')
  clearDraft(storage, USER)
  assert.equal(storage.data.size, 0)
  const broken: StorageLike = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') }, removeItem: () => { throw new Error('denied') } }
  assert.doesNotThrow(() => saveDraft(broken, USER, 'x', [], ''))
  assert.doesNotThrow(() => clearDraft(broken, USER))
  assert.equal(loadDraft(broken, USER, 'x'), null)
})

test('a draft saved by the previous version of the app (session stored as "active") is still restored', () => {
  const storage = memoryStorage()
  storage.setItem(draftStorageKey(USER), JSON.stringify({ active: { id: 'session-A', title: 'Push' }, drafts: [{ key: 'a', reps: 10 }], notes: 'old format' }))
  assert.deepEqual(loadDraft(storage, USER, 'session-A')?.drafts, [{ key: 'a', reps: 10 }])
  assert.equal(loadDraft(storage, USER, 'session-A')?.notes, 'old format')
  assert.equal(loadDraft(storage, USER, 'session-B'), null) // still never applied to a different session
  storage.setItem(draftStorageKey(USER), JSON.stringify({ active: null, drafts: [] }))
  assert.equal(loadDraft(storage, USER, 'session-A'), null)
})
