import type { ActivityScoring, CardioSession, WorkoutSession, WorkoutSet } from './types'

export const IST_TIMEZONE = 'Asia/Kolkata'

export const DEFAULT_SCORING: ActivityScoring = {
  strength_complete_points: 40,
  set_points: 5,
  cardio_minute_points: 1,
  low_threshold: 10,
  moderate_threshold: 30,
  high_threshold: 55,
  very_high_threshold: 80,
}

// ---------------------------------------------------------------------------
// Dates. Every "day" in this app is an Asia/Kolkata calendar date (YYYY-MM-DD).
// India has no daylight-saving time, so IST is a fixed UTC+05:30 offset and all of the
// arithmetic below is done in plain UTC milliseconds. It never consults the browser's own
// time zone, which means a phone or laptop set to another zone still reports the same day.
// ---------------------------------------------------------------------------
export const IST_OFFSET_MINUTES = 330
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/** The Asia/Kolkata calendar date of an instant (Date, epoch ms, or ISO timestamp). */
export const istDate = (instant: Date | number | string = Date.now()): string => {
  const ms = new Date(instant).getTime()
  if (Number.isNaN(ms)) return ''
  return new Date(ms + IST_OFFSET_MINUTES * MINUTE_MS).toISOString().slice(0, 10)
}
export const todayISO = (now: Date | number = Date.now()) => istDate(now)

/** Milliseconds from `now` until the next 00:00 in Asia/Kolkata (always > 0). */
export const msUntilNextIstMidnight = (now: number = Date.now()) => {
  const shifted = now + IST_OFFSET_MINUTES * MINUTE_MS
  return (Math.floor(shifted / DAY_MS) + 1) * DAY_MS - shifted
}

const parseISO = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}
const utcMs = (date: string) => {
  const { y, m, d } = parseISO(date)
  return Date.UTC(y, m - 1, d)
}
const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Noon IST on the given date: a safe instant for formatting a date-only value. */
export const dateFromISO = (date: string) => new Date(`${date}T12:00:00+05:30`)
export const isoFromDate = (date: Date) => istDate(date)
export const addDays = (date: string, amount: number) => fromUtcMs(utcMs(date) + amount * DAY_MS)
export const weekday = (date: string) => new Date(utcMs(date)).getUTCDay()
export const startOfWeek = (date = todayISO()) => addDays(date, -weekday(date))
export const startOfMonth = (date = todayISO()) => `${date.slice(0, 7)}-01`
export const monthOf = (date: string) => date.slice(0, 7)
export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
/** `month` is YYYY-MM. Returns first day, last day and every date in between. */
export const monthDates = (month: string) => {
  const start = `${month}-01`
  const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const dates: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date)
  return { start, end, dates }
}
export const shiftMonth = (month: string, amount: number) => {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + amount
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}
/** The last fully finished month in Asia/Kolkata, e.g. 2026-09 when today is 2026-10-30. */
export const mostRecentCompletedMonth = (now: Date | number = Date.now()) => shiftMonth(monthOf(todayISO(now)), -1)

export const formatDate = (date: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: IST_TIMEZONE }).format(dateFromISO(date))
export const sameWeek = (date: string, pivot = todayISO()) => date >= startOfWeek(pivot) && date <= addDays(startOfWeek(pivot), 6)
export const minuteLabel = (seconds: number) => `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`
export const secondsToMinutes = (seconds: number) => Math.round(seconds / 60)
export const number = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: digits })

export function activityScore(
  date: string,
  sessions: WorkoutSession[],
  sets: WorkoutSet[],
  cardio: CardioSession[],
  scoring: ActivityScoring,
) {
  const strength = sessions.filter((s) => s.session_date === date && s.completed)
  const ids = new Set(strength.map((s) => s.id))
  const completedSets = sets.filter((s) => ids.has(s.workout_session_id) && s.completed).length
  const cardioSeconds = cardio.filter((s) => s.session_date === date).reduce((sum, s) => sum + s.active_seconds, 0)
  const score = strength.length * scoring.strength_complete_points + completedSets * scoring.set_points + (cardioSeconds / 60) * scoring.cardio_minute_points
  if (score >= scoring.very_high_threshold) return { score, level: 4 }
  if (score >= scoring.high_threshold) return { score, level: 3 }
  if (score >= scoring.moderate_threshold) return { score, level: 2 }
  if (score >= scoring.low_threshold) return { score, level: 1 }
  return { score, level: 0 }
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n')
}

/** A random UUID. Used as the idempotency key for retry-safe inserts. */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
