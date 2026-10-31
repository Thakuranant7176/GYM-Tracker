import { MAX_PLAUSIBLE_CYCLING_KMH, MAX_PLAUSIBLE_TREADMILL_KMH } from './calories'
import { parseDecimal } from './numbers'
import type { CardioSession } from './types'

// ---------------------------------------------------------------------------
// Cardio logging: three options, each with its own fields.
//
//   Cycling   – time (required), distance (optional)
//   Treadmill – speed, incline and time (all required; enter 0 for a flat belt)
//   Walking   – time (required), distance (optional)
//
// Everything here is pure so it can be unit-tested. Limits mirror the database constraints
// (cardio_sessions) and the calorie estimator's plausibility checks, so a bad number is caught
// with a clear message instead of a raw database error or a nonsense calorie figure.
// ---------------------------------------------------------------------------

export type CardioKind = 'cycling' | 'treadmill' | 'walking'
/** `other` exists only so an older record of that type can still be edited; it is not offered for new sessions. */
export type CardioFormKind = CardioKind | 'other'
export type CardioField = 'date' | 'minutes' | 'speed' | 'incline' | 'distance'

export type CardioOption = {
  kind: CardioKind
  label: string
  hint: string
  /** Fields shown for this option, in order (date and notes are always shown). */
  fields: readonly CardioField[]
  required: readonly CardioField[]
}

export const CARDIO_OPTIONS: readonly CardioOption[] = [
  { kind: 'cycling', label: 'Cycling', hint: 'Time, plus distance if you know it', fields: ['minutes', 'distance'], required: ['minutes'] },
  { kind: 'treadmill', label: 'Treadmill', hint: 'Speed, incline and time', fields: ['speed', 'incline', 'minutes'], required: ['speed', 'incline', 'minutes'] },
  { kind: 'walking', label: 'Walking', hint: 'Just the time', fields: ['minutes', 'distance'], required: ['minutes'] },
]

export const CARDIO_LIMITS = {
  minMinutes: 1,
  /** Manual entries only; a live timer may run longer (the database allows 48 h). */
  maxMinutes: 720,
  maxTimerSeconds: 172_800,
  minSpeedKmh: 0.5,
  maxSpeedKmh: MAX_PLAUSIBLE_TREADMILL_KMH,
  minInclinePercent: 0,
  maxInclinePercent: 40,
  minDistanceKm: 0.01,
  maxDistanceKm: 500,
} as const

export type CardioFormInput = {
  kind: CardioFormKind
  date: string
  minutes: string
  speed: string
  incline: string
  distance: string
  notes: string
}

export const emptyCardioForm = (date: string, kind: CardioFormKind = 'treadmill'): CardioFormInput => ({
  kind,
  date,
  minutes: '',
  speed: '',
  incline: '',
  distance: '',
  notes: '',
})

/** Only the fields that apply to the chosen option are present; an absent key means "leave as is" on an update. */
export type CardioPayload = {
  activity_type: CardioFormKind
  session_date: string
  active_seconds: number
  notes: string | null
  average_speed_kmh?: number | null
  incline_percent?: number | null
  distance_km?: number | null
}

export type CardioCheck = { ok: true; payload: CardioPayload } | { ok: false; field: CardioField; error: string }

const isRealDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [y, m, d] = date.split('-').map(Number)
  const check = new Date(Date.UTC(y, m - 1, d))
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
}

const fail = (field: CardioField, error: string): CardioCheck => ({ ok: false, field, error })
const trimNumber = (value: number) => Number(value.toFixed(3))

/**
 * Validates a cardio entry and builds the database payload.
 *
 * @param today   the current Asia/Kolkata date; a session cannot be dated after it.
 * @param options.seconds       use this duration (from the live timer) instead of the minutes field.
 * @param options.previousKind  when editing, the record's original activity. If the option changed,
 *                              details that no longer apply are cleared; otherwise untouched details are left alone.
 */
export function validateCardio(input: CardioFormInput, today: string, options: { seconds?: number; previousKind?: CardioFormKind | null } = {}): CardioCheck {
  const { kind } = input
  if (!isRealDate(input.date)) return fail('date', 'Choose a valid date.')
  if (input.date > today) return fail('date', 'A cardio session cannot be dated in the future.')
  if (input.date < '2000-01-01') return fail('date', 'Choose a more recent date.')

  // --- time --------------------------------------------------------------------
  let seconds: number
  if (options.seconds != null) {
    seconds = Math.round(options.seconds)
    if (seconds < CARDIO_LIMITS.minMinutes * 60) return fail('minutes', 'Run the timer for at least a minute before saving.')
    if (seconds > CARDIO_LIMITS.maxTimerSeconds) return fail('minutes', 'That timer is longer than 48 hours. Discard it and enter the time you actually exercised.')
  } else {
    const minutes = parseDecimal(input.minutes)
    if (minutes.blank) return fail('minutes', 'Enter the time in minutes.')
    if (minutes.value == null || minutes.value < CARDIO_LIMITS.minMinutes || minutes.value > CARDIO_LIMITS.maxMinutes) {
      return fail('minutes', `Time must be between ${CARDIO_LIMITS.minMinutes} and ${CARDIO_LIMITS.maxMinutes} minutes.`)
    }
    seconds = Math.round(minutes.value * 60)
  }

  const payload: CardioPayload = {
    activity_type: kind,
    session_date: input.date,
    active_seconds: seconds,
    notes: input.notes.trim() ? input.notes.trim().slice(0, 1000) : null,
  }
  const changedKind = options.previousKind != null && options.previousKind !== kind
  const hours = seconds / 3600

  // --- option-specific details ---------------------------------------------------
  if (kind === 'treadmill') {
    const speed = parseDecimal(input.speed)
    if (speed.blank) return fail('speed', 'Enter the treadmill speed in km/h.')
    if (speed.value == null || speed.value < CARDIO_LIMITS.minSpeedKmh || speed.value > CARDIO_LIMITS.maxSpeedKmh) {
      return fail('speed', `Speed must be between ${CARDIO_LIMITS.minSpeedKmh} and ${CARDIO_LIMITS.maxSpeedKmh} km/h.`)
    }
    const incline = parseDecimal(input.incline)
    if (incline.blank) return fail('incline', 'Enter the incline in % (0 if the belt was flat).')
    if (incline.value == null || incline.value < CARDIO_LIMITS.minInclinePercent || incline.value > CARDIO_LIMITS.maxInclinePercent) {
      return fail('incline', `Incline must be between ${CARDIO_LIMITS.minInclinePercent} and ${CARDIO_LIMITS.maxInclinePercent}%.`)
    }
    payload.average_speed_kmh = trimNumber(speed.value)
    payload.incline_percent = trimNumber(incline.value)
    if (changedKind) payload.distance_km = null
  } else if (kind === 'cycling' || kind === 'walking') {
    const distance = parseDecimal(input.distance)
    if (!distance.blank) {
      if (distance.value == null || distance.value < CARDIO_LIMITS.minDistanceKm || distance.value > CARDIO_LIMITS.maxDistanceKm) {
        return fail('distance', `Distance must be between ${CARDIO_LIMITS.minDistanceKm} and ${CARDIO_LIMITS.maxDistanceKm} km, or left empty.`)
      }
      const limit = kind === 'cycling' ? MAX_PLAUSIBLE_CYCLING_KMH : MAX_PLAUSIBLE_TREADMILL_KMH
      if (distance.value / hours > limit) {
        return fail('distance', `${distance.value} km in that time is faster than ${limit} km/h. Check the distance or the time.`)
      }
    }
    payload.distance_km = distance.blank ? null : trimNumber(distance.value as number)
    if (changedKind) {
      payload.average_speed_kmh = null
      payload.incline_percent = null
    }
  }
  return { ok: true, payload }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const cardioLabel = (type: CardioSession['activity_type']) =>
  ({ cycling: 'Cycling', treadmill: 'Treadmill', walking: 'Walking', other: 'Other cardio' })[type] ?? type

const plain = (value: number) => String(Number(value.toFixed(2)))

/** The recorded details of a session, e.g. ["6 km/h", "10% incline", "3.5 km"]. Nothing is shown for details that were not entered. */
export function cardioDetails(session: Pick<CardioSession, 'average_speed_kmh' | 'incline_percent' | 'distance_km' | 'machine_calories' | 'heart_rate_bpm'>): string[] {
  const parts: string[] = []
  if (session.average_speed_kmh != null) parts.push(`${plain(Number(session.average_speed_kmh))} km/h`)
  if (session.incline_percent != null) parts.push(`${plain(Number(session.incline_percent))}% incline`)
  if (session.distance_km != null) parts.push(`${plain(Number(session.distance_km))} km`)
  if (session.heart_rate_bpm != null) parts.push(`${session.heart_rate_bpm} bpm`)
  if (session.machine_calories != null) parts.push(`${session.machine_calories} machine kcal`)
  return parts
}

/** Loads a saved session into the form. Durations are shown in minutes (to 2 decimals) so unchanged times save back identically. */
export function formFromSession(session: CardioSession): CardioFormInput {
  const text = (value: number | null) => (value == null ? '' : String(Number(value)))
  return {
    kind: session.activity_type,
    date: session.session_date,
    minutes: String(Number((session.active_seconds / 60).toFixed(2))),
    speed: text(session.average_speed_kmh),
    incline: text(session.incline_percent),
    distance: text(session.distance_km),
    notes: session.notes ?? '',
  }
}

/** True when the entered time still equals the saved duration (within rounding), so an edit must not rewrite it. */
export const sameDuration = (enteredMinutes: string, savedSeconds: number) => {
  const parsed = parseDecimal(enteredMinutes)
  return !parsed.blank && parsed.value != null && Math.abs(Math.round(parsed.value * 60) - savedSeconds) <= 1
}
