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

export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(new Date())

export const dateFromISO = (date: string) => new Date(`${date}T12:00:00+05:30`)
export const isoFromDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE })
export const addDays = (date: string, amount: number) => {
  const next = dateFromISO(date)
  next.setDate(next.getDate() + amount)
  return isoFromDate(next)
}
export const weekday = (date: string) => dateFromISO(date).getDay()
export const startOfWeek = (date = todayISO()) => addDays(date, -weekday(date))
export const startOfMonth = (date = todayISO()) => `${date.slice(0, 7)}-01`
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
  const strength = sessions.filter((s) => s.session_date === date)
  const ids = new Set(strength.map((s) => s.id))
  const completedSets = sets.filter((s) => ids.has(s.workout_session_id) && s.completed).length
  const cardioSeconds = cardio.filter((s) => s.session_date === date).reduce((sum, s) => sum + s.active_seconds, 0)
  const score = strength.filter((s) => s.completed).length * scoring.strength_complete_points + completedSets * scoring.set_points + (cardioSeconds / 60) * scoring.cardio_minute_points
  if (score >= scoring.very_high_threshold) return { score, level: 4 }
  if (score >= scoring.high_threshold) return { score, level: 3 }
  if (score >= scoring.moderate_threshold) return { score, level: 2 }
  if (score >= scoring.low_threshold) return { score, level: 1 }
  return { score, level: 0 }
}

export function downloadFile(filename: string, content: string, type: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type }))
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n')
}
