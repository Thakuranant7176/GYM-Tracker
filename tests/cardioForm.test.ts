import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDIO_OPTIONS, cardioDetails, cardioLabel, emptyCardioForm, formFromSession, sameDuration, validateCardio, type CardioFormInput } from '../src/cardioForm'
import { cardio } from './fixtures'

const TODAY = '2026-10-31'
const form = (patch: Partial<CardioFormInput>): CardioFormInput => ({ ...emptyCardioForm(TODAY, 'treadmill'), ...patch })
const ok = (input: CardioFormInput, options?: Parameters<typeof validateCardio>[2]) => {
  const result = validateCardio(input, TODAY, options)
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.ok ? result.payload : (undefined as never)
}
const bad = (input: CardioFormInput, field: string, options?: Parameters<typeof validateCardio>[2]) => {
  const result = validateCardio(input, TODAY, options)
  assert.equal(result.ok, false, 'expected a validation error')
  if (!result.ok) {
    assert.equal(result.field, field)
    assert.ok(result.error.length > 10, 'the message should explain the problem')
  }
}

test('there are exactly three options: cycling, treadmill, walking', () => {
  assert.deepEqual(CARDIO_OPTIONS.map((option) => option.kind), ['cycling', 'treadmill', 'walking'])
})

test('each option asks for the right things', () => {
  const by = Object.fromEntries(CARDIO_OPTIONS.map((option) => [option.kind, option]))
  assert.deepEqual(by.cycling.fields, ['minutes', 'distance'])
  assert.deepEqual(by.cycling.required, ['minutes'])
  assert.deepEqual([...by.treadmill.fields].sort(), ['incline', 'minutes', 'speed'])
  assert.deepEqual([...by.treadmill.required].sort(), ['incline', 'minutes', 'speed'])
  assert.deepEqual(by.walking.fields, ['minutes', 'distance'])
  assert.deepEqual(by.walking.required, ['minutes'])
})

// ---- cycling and walking: time is all that is required -------------------------------------
test('cycling with just a time is valid', () => {
  const payload = ok(form({ kind: 'cycling', minutes: '30' }))
  assert.equal(payload.activity_type, 'cycling')
  assert.equal(payload.session_date, TODAY)
  assert.equal(payload.active_seconds, 1800)
  assert.equal(payload.distance_km, null)
  assert.ok(!('average_speed_kmh' in payload) && !('incline_percent' in payload), 'speed and incline do not apply to cycling')
})

test('walking with just a time is valid', () => {
  const payload = ok(form({ kind: 'walking', minutes: '45' }))
  assert.equal(payload.activity_type, 'walking')
  assert.equal(payload.active_seconds, 2700)
  assert.equal(payload.distance_km, null)
})

test('distance is optional for cycling and walking, but must be sensible when given', () => {
  assert.equal(ok(form({ kind: 'cycling', minutes: '30', distance: '12.5' })).distance_km, 12.5)
  assert.equal(ok(form({ kind: 'walking', minutes: '30', distance: '2,5' })).distance_km, 2.5)
  bad(form({ kind: 'cycling', minutes: '30', distance: 'abc' }), 'distance')
  bad(form({ kind: 'cycling', minutes: '30', distance: '0' }), 'distance')
  bad(form({ kind: 'cycling', minutes: '30', distance: '501' }), 'distance')
  bad(form({ kind: 'cycling', minutes: '30', distance: '40' }), 'distance') // 80 km/h
  bad(form({ kind: 'walking', minutes: '30', distance: '15' }), 'distance') // 30 km/h on foot
})

// ---- treadmill: speed, incline and time are all required -----------------------------------
test('treadmill needs speed, incline and time', () => {
  const payload = ok(form({ kind: 'treadmill', minutes: '30', speed: '6', incline: '10' }))
  assert.equal(payload.activity_type, 'treadmill')
  assert.equal(payload.active_seconds, 1800)
  assert.equal(payload.average_speed_kmh, 6)
  assert.equal(payload.incline_percent, 10)
  bad(form({ kind: 'treadmill', minutes: '30', incline: '5' }), 'speed')
  bad(form({ kind: 'treadmill', minutes: '30', speed: '6' }), 'incline')
  bad(form({ kind: 'treadmill', speed: '6', incline: '5' }), 'minutes')
})

test('a flat treadmill is an incline of 0, which is valid; blank is not', () => {
  assert.equal(ok(form({ kind: 'treadmill', minutes: '20', speed: '5.5', incline: '0' })).incline_percent, 0)
  bad(form({ kind: 'treadmill', minutes: '20', speed: '5.5', incline: '' }), 'incline')
})

test('treadmill speed and incline limits', () => {
  bad(form({ kind: 'treadmill', minutes: '20', speed: '0.4', incline: '1' }), 'speed')
  bad(form({ kind: 'treadmill', minutes: '20', speed: '25.1', incline: '1' }), 'speed')
  assert.equal(ok(form({ kind: 'treadmill', minutes: '20', speed: '25', incline: '40' })).incline_percent, 40)
  bad(form({ kind: 'treadmill', minutes: '20', speed: '6', incline: '40.5' }), 'incline')
  bad(form({ kind: 'treadmill', minutes: '20', speed: '6', incline: '-1' }), 'incline')
})

// ---- the time field ---------------------------------------------------------------------------
test('time is parsed strictly', () => {
  assert.equal(ok(form({ kind: 'walking', minutes: '30.5' })).active_seconds, 1830)
  assert.equal(ok(form({ kind: 'walking', minutes: '30,5' })).active_seconds, 1830) // comma decimal
  assert.equal(ok(form({ kind: 'walking', minutes: ' 30 ' })).active_seconds, 1800)
  for (const text of ['', '   ']) bad(form({ kind: 'walking', minutes: text }), 'minutes')
  for (const text of ['0', '0.5', '-5', 'abc', '1e2', '30 min', '721', '1,000', '5,5,5', '1.2.3', '.']) bad(form({ kind: 'walking', minutes: text }), 'minutes')
  assert.equal(ok(form({ kind: 'walking', minutes: '2,25' })).active_seconds, 135) // decimal comma, two digits
  assert.equal(ok(form({ kind: 'walking', minutes: '720' })).active_seconds, 43200)
  assert.equal(ok(form({ kind: 'walking', minutes: '1' })).active_seconds, 60)
})

test('a live timer supplies the time instead of the minutes field', () => {
  assert.equal(ok(form({ kind: 'walking', minutes: '' }), { seconds: 1790 }).active_seconds, 1790)
  assert.equal(ok(form({ kind: 'walking', minutes: 'ignored' }), { seconds: 1790 }).active_seconds, 1790)
  bad(form({ kind: 'walking' }), 'minutes', { seconds: 59 })
  bad(form({ kind: 'walking' }), 'minutes', { seconds: 172_801 })
  assert.equal(ok(form({ kind: 'walking' }), { seconds: 100_000 }).active_seconds, 100_000) // long, but allowed for a timer
})

// ---- dates ---------------------------------------------------------------------------------------
test('the date must be real and not in the future (Asia/Kolkata today)', () => {
  assert.equal(ok(form({ kind: 'walking', minutes: '30', date: TODAY })).session_date, TODAY)
  assert.equal(ok(form({ kind: 'walking', minutes: '30', date: '2026-10-12' })).session_date, '2026-10-12')
  bad(form({ kind: 'walking', minutes: '30', date: '2026-11-01' }), 'date')
  bad(form({ kind: 'walking', minutes: '30', date: '2026-02-30' }), 'date')
  bad(form({ kind: 'walking', minutes: '30', date: 'tomorrow' }), 'date')
  bad(form({ kind: 'walking', minutes: '30', date: '' }), 'date')
  bad(form({ kind: 'walking', minutes: '30', date: '1999-12-31' }), 'date')
})

// ---- notes ---------------------------------------------------------------------------------------
test('notes are trimmed and empty notes become null', () => {
  assert.equal(ok(form({ kind: 'walking', minutes: '30', notes: '  felt good  ' })).notes, 'felt good')
  assert.equal(ok(form({ kind: 'walking', minutes: '30', notes: '   ' })).notes, null)
})

// ---- editing: untouched details are never rewritten -------------------------------------------
test('editing without changing the activity leaves details this form does not collect alone', () => {
  const treadmill = ok(form({ kind: 'treadmill', minutes: '30', speed: '6', incline: '2' }), { previousKind: 'treadmill' })
  assert.ok(!('distance_km' in treadmill))
  const cycling = ok(form({ kind: 'cycling', minutes: '30' }), { previousKind: 'cycling' })
  assert.ok(!('average_speed_kmh' in cycling) && !('incline_percent' in cycling))
  const other = ok(form({ kind: 'other', minutes: '30' }), { previousKind: 'other' })
  assert.deepEqual(Object.keys(other).sort(), ['active_seconds', 'activity_type', 'notes', 'session_date'])
})

test('changing the activity clears details that no longer apply', () => {
  const toWalking = ok(form({ kind: 'walking', minutes: '30' }), { previousKind: 'treadmill' })
  assert.equal(toWalking.average_speed_kmh, null)
  assert.equal(toWalking.incline_percent, null)
  const toTreadmill = ok(form({ kind: 'treadmill', minutes: '30', speed: '6', incline: '0' }), { previousKind: 'walking' })
  assert.equal(toTreadmill.distance_km, null)
  const fromOther = ok(form({ kind: 'cycling', minutes: '30' }), { previousKind: 'other' })
  assert.equal(fromOther.average_speed_kmh, null)
})

test('loading a saved session into the form and detecting an unchanged duration', () => {
  const session = cardio({ session_date: '2026-10-12', activity_type: 'treadmill', active_seconds: 1790, average_speed_kmh: 6, incline_percent: 2.5, distance_km: null, notes: 'hills' })
  const loaded = formFromSession(session)
  assert.deepEqual(loaded, { kind: 'treadmill', date: '2026-10-12', minutes: '29.83', speed: '6', incline: '2.5', distance: '', notes: 'hills' })
  assert.equal(sameDuration(loaded.minutes, 1790), true) // 29.83 min is 1790 s: saving must not rewrite it
  assert.equal(sameDuration('30', 1790), false)
  assert.equal(sameDuration('29.83', 1800), false)
  assert.equal(sameDuration('', 1790), false)
  assert.equal(sameDuration('abc', 1790), false)
})

// ---- display -----------------------------------------------------------------------------------------
test('labels and details show only what was recorded', () => {
  assert.equal(cardioLabel('cycling'), 'Cycling')
  assert.equal(cardioLabel('treadmill'), 'Treadmill')
  assert.equal(cardioLabel('walking'), 'Walking')
  assert.equal(cardioLabel('other'), 'Other cardio')
  const session = cardio({ session_date: TODAY, average_speed_kmh: 6, incline_percent: 10, distance_km: 3.5 })
  assert.deepEqual(cardioDetails(session), ['6 km/h', '10% incline', '3.5 km'])
  assert.deepEqual(cardioDetails(cardio({ session_date: TODAY })), [])
  assert.deepEqual(cardioDetails(cardio({ session_date: TODAY, incline_percent: 0 })), ['0% incline']) // a flat belt is recorded, not missing
})
