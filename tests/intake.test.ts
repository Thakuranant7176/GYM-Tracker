import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubmissionTracker, validateIntake } from '../src/intake'

const ctx = { foodCalories: 400, currentTotal: 1000 }

test('add: whole kcal from 1 to 20,000', () => {
  assert.deepEqual(validateIntake('add', '650', ctx), { ok: true, value: 650 })
  for (const bad of ['', '  ', '0', '-5', '12.5', 'abc', '20001', '1e9']) {
    assert.equal(validateIntake('add', bad, ctx).ok, false, `"${bad}" should be rejected`)
  }
})

test('add: the day total after adding may not exceed 20,000', () => {
  assert.equal(validateIntake('add', '5000', { foodCalories: 0, currentTotal: 15000 }).ok, true)
  assert.equal(validateIntake('add', '5001', { foodCalories: 0, currentTotal: 15000 }).ok, false)
  assert.equal(validateIntake('add', '100', { foodCalories: 0, currentTotal: null }).ok, true)
})

test('set: an explicit 0 is allowed, but never below what the food log already totals', () => {
  assert.deepEqual(validateIntake('set', '0', { foodCalories: 0, currentTotal: null }), { ok: true, value: 0 })
  assert.equal(validateIntake('set', '0', ctx).ok, false) // food log is 400
  assert.equal(validateIntake('set', '399', ctx).ok, false)
  assert.deepEqual(validateIntake('set', '400', ctx), { ok: true, value: 400 })
  assert.deepEqual(validateIntake('set', '2100', ctx), { ok: true, value: 2100 })
})

test('add and set are different operations with different rules', () => {
  assert.equal(validateIntake('add', '0', ctx).ok, false)
  assert.equal(validateIntake('set', '0', { foodCalories: 0, currentTotal: null }).ok, true)
})

test('a retry of the same submission reuses one id, so the database can ignore the repeat', () => {
  let counter = 0
  const tracker = createSubmissionTracker(() => `id-${++counter}`)
  const first = tracker.current()
  assert.equal(tracker.current(), first)
  assert.equal(tracker.current(), first)
  assert.equal(counter, 1)
})

test('changing the content or succeeding starts a new submission with a new id', () => {
  let counter = 0
  const tracker = createSubmissionTracker(() => `id-${++counter}`)
  const first = tracker.current()
  tracker.reset()
  const second = tracker.current()
  assert.notEqual(first, second)
  assert.equal(tracker.current(), second)
})

test('simulated store: a lost response followed by a retry stores the entry once', () => {
  // Models INSERT ... ON CONFLICT (id) DO NOTHING, which is what the app sends.
  const rows = new Map<string, { id: string; calories: number }>()
  const insertIgnoringDuplicates = (row: { id: string; calories: number }) => {
    if (!rows.has(row.id)) rows.set(row.id, row)
  }
  let counter = 0
  const tracker = createSubmissionTracker(() => `id-${++counter}`)
  insertIgnoringDuplicates({ id: tracker.current(), calories: 500 }) // committed, response lost
  insertIgnoringDuplicates({ id: tracker.current(), calories: 500 }) // user taps again / auto retry
  insertIgnoringDuplicates({ id: tracker.current(), calories: 500 }) // and again
  assert.equal(rows.size, 1)
  tracker.reset() // the user edits the amount: a genuinely new entry
  insertIgnoringDuplicates({ id: tracker.current(), calories: 600 })
  assert.equal(rows.size, 2)
  assert.deepEqual([...rows.values()].map((row) => row.calories), [500, 600])
})
