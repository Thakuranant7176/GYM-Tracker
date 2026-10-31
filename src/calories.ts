import { isCompletedSession } from './workoutLifecycle'
import type { CalorieIntakeEntry, CardioSession, FoodEntry, Profile, WeightEntry, WorkoutSession } from './types'

// ---------------------------------------------------------------------------
// Everything calorie-related lives here so the dashboard rings, the monthly report and
// the tests all use one formula. All exercise and balance figures are ESTIMATES.
// ---------------------------------------------------------------------------

export const MET = {
  /** Used for completed strength sessions that have a reliable duration. */
  strength: 3.5,
  cycling: 6.8,
  walking: 3.5,
  /** Used only for treadmill sessions with neither speed nor distance recorded. */
  treadmillFallback: 5,
} as const

/** Treadmill speeds above this are treated as a data-entry error, not an estimate input. */
export const MAX_PLAUSIBLE_TREADMILL_KMH = 25

export const CALORIE_METHODOLOGY_LIST = [
  'Exercise calories are ACTIVE (net) calories: energy above resting, estimated as (MET − 1) × 3.5 × body weight (kg) ÷ 200 per minute. Resting energy is already part of maintenance, so it is not counted again.',
  'Treadmill sessions use the ACSM walking equation (speeds up to 8 km/h) or running equation (faster), driven by recorded speed — or distance ÷ time — and incline. A treadmill session with neither is estimated at a conservative fixed 5 MET and is labelled "assumed intensity".',
  'Cycling uses 6.8 MET and walking 3.5 MET as fixed assumptions. Other cardio uses the machine-reported calories if one was entered, otherwise it is left out and counted as "unavailable".',
  'Strength training uses 3.5 MET for the session duration, only when the completed session has a reliable duration (derived from start and finish times; sessions left open for over 4 hours have no duration). Sets, reps and loads are NOT turned into calories — they do not support a defensible figure.',
  'Double counting is prevented by (1) estimating each workout session once, never again per set, (2) estimating each cardio record once, and (3) subtracting any strength time that overlaps a recorded cardio interval.',
  'Body weight is the most recent weigh-in on or before the day; if none exists the starting weight from your goals is used and flagged as such. Without a weight, no exercise estimate is made.',
  'Calorie intake = detailed food entries + manual quick-add entries for the day. A day with neither is "not recorded", which is different from a recorded 0.',
  'Estimated daily balance = estimated daily energy expenditure − calories consumed. Expenditure is your configured maintenance estimate; recorded exercise is added only when you have said your maintenance figure EXCLUDES workouts. A positive balance is a deficit, a negative balance is a surplus.',
] as const
export const CALORIE_METHODOLOGY = CALORIE_METHODOLOGY_LIST.join(' ')

export type EstimateConfidence = 'speed_based' | 'assumed_intensity' | 'machine_reported' | 'unavailable'

export type ExerciseEstimate = {
  calories: number | null
  method: string
  confidence: EstimateConfidence
  /** Strength only: seconds removed because they overlapped recorded cardio. */
  overlapSecondsRemoved?: number
}

export type WeightInfo = { kg: number | null; source: 'measured' | 'starting_weight' | null }

export type DailyCalories = {
  date: string
  weightKg: number | null
  weightSource: WeightInfo['source']
  foodCalories: number
  foodEntryCount: number
  quickAddCalories: number
  quickAddEntryCount: number
  /** null = nothing recorded for the day (NOT zero). */
  intakeCalories: number | null
  exerciseCalories: number
  cardioCalories: number
  strengthCalories: number
  exerciseRecordCount: number
  unavailableExerciseRecords: number
  assumedIntensityRecords: number
  maintenanceCalories: number | null
  maintenanceIncludesExercise: boolean
  estimatedExpenditure: number | null
  /** expenditure − intake. Positive = deficit, negative = surplus, null = inputs missing. */
  estimatedBalance: number | null
  missingInputs: Array<'maintenance' | 'intake'>
}

const rounded = (value: number) => Math.max(0, Math.round(value))
const uniqueById = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((row) => [row.id, row])).values()]

export function weightInfoForDate(date: string, weights: WeightEntry[], profile: Pick<Profile, 'starting_weight_kg'>): WeightInfo {
  let best: WeightEntry | null = null
  for (const entry of weights) {
    if (entry.entry_date <= date && (best == null || entry.entry_date >= best.entry_date)) best = entry
  }
  if (best) return { kg: Number(best.weight_kg), source: 'measured' }
  if (profile.starting_weight_kg != null) return { kg: Number(profile.starting_weight_kg), source: 'starting_weight' }
  return { kg: null, source: null }
}
export const weightForDate = (date: string, weights: WeightEntry[], profile: Pick<Profile, 'starting_weight_kg'>) =>
  weightInfoForDate(date, weights, profile).kg

/** Net kcal for `seconds` at `met`: (MET − 1) × 3.5 × kg ÷ 200 per minute. */
export function activeCaloriesFromMet(met: number, weightKg: number, seconds: number) {
  const minutes = seconds / 60
  return rounded(Math.max(0, met - 1) * 3.5 * weightKg * minutes / 200)
}

/** ACSM metabolic equations. Speed in km/h, grade as a percentage. Returns gross MET. */
export function acsmTreadmillMet(speedKmh: number, inclinePercent: number | null | undefined) {
  const metresPerMinute = speedKmh * 1000 / 60
  const grade = Number(inclinePercent ?? 0) / 100
  const vo2 = metresPerMinute <= 134
    ? 0.1 * metresPerMinute + 1.8 * metresPerMinute * grade + 3.5
    : 0.2 * metresPerMinute + 0.9 * metresPerMinute * grade + 3.5
  return Math.max(1, vo2 / 3.5)
}

export function estimateCardioActiveCalories(session: CardioSession, weightKg: number | null): ExerciseEstimate {
  if (!weightKg || weightKg <= 0) return { calories: null, method: 'Body weight is required for an active-calorie estimate', confidence: 'unavailable' }
  if (!(session.active_seconds > 0)) return { calories: null, method: 'Session has no active duration', confidence: 'unavailable' }
  if (session.activity_type === 'treadmill') {
    const hours = session.active_seconds / 3600
    const derivedSpeed = session.distance_km != null && Number(session.distance_km) > 0 ? Number(session.distance_km) / hours : null
    const speedKmh = session.average_speed_kmh != null && Number(session.average_speed_kmh) > 0 ? Number(session.average_speed_kmh) : derivedSpeed
    if (speedKmh == null) {
      return { calories: activeCaloriesFromMet(MET.treadmillFallback, weightKg, session.active_seconds), method: 'Assumed intensity: no speed or distance recorded (5 MET)', confidence: 'assumed_intensity' }
    }
    if (speedKmh > MAX_PLAUSIBLE_TREADMILL_KMH) {
      return { calories: null, method: `Recorded treadmill speed (${speedKmh.toFixed(1)} km/h) is outside a plausible range`, confidence: 'unavailable' }
    }
    return {
      calories: activeCaloriesFromMet(acsmTreadmillMet(speedKmh, session.incline_percent), weightKg, session.active_seconds),
      method: 'ACSM treadmill equation from recorded speed/distance and incline',
      confidence: 'speed_based',
    }
  }
  if (session.activity_type === 'cycling') return { calories: activeCaloriesFromMet(MET.cycling, weightKg, session.active_seconds), method: 'Assumed intensity: moderate cycling (6.8 MET)', confidence: 'assumed_intensity' }
  if (session.activity_type === 'walking') return { calories: activeCaloriesFromMet(MET.walking, weightKg, session.active_seconds), method: 'Assumed intensity: brisk walking (3.5 MET)', confidence: 'assumed_intensity' }
  if (session.machine_calories != null) return { calories: rounded(Number(session.machine_calories)), method: 'Machine-reported calories (active/resting split unknown)', confidence: 'machine_reported' }
  return { calories: null, method: 'Other cardio needs a machine-calorie reading to be estimated', confidence: 'unavailable' }
}

type Interval = [number, number]

/** Wall-clock span of a cardio record, when it has a start time. Manual entries have none. */
export function cardioInterval(session: CardioSession): Interval | null {
  if (!session.started_at) return null
  const start = new Date(session.started_at).getTime()
  if (Number.isNaN(start)) return null
  return [start, start + (Number(session.active_seconds) + Number(session.paused_seconds ?? 0)) * 1000]
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.map((interval): Interval => [interval[0], interval[1]]).sort((a, b) => a[0] - b[0])
  const merged: Interval[] = []
  for (const [start, end] of sorted) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

function overlapSeconds(interval: Interval, mergedOthers: Interval[]) {
  let overlap = 0
  for (const [start, end] of mergedOthers) overlap += Math.max(0, Math.min(interval[1], end) - Math.max(interval[0], start))
  return overlap / 1000
}

export function estimateStrengthActiveCalories(session: WorkoutSession, weightKg: number | null, cardioIntervals: Interval[] = []): ExerciseEstimate {
  if (!weightKg || weightKg <= 0) return { calories: null, method: 'Body weight is required for an active-calorie estimate', confidence: 'unavailable' }
  const minutes = session.total_duration_minutes
  if (!minutes || minutes <= 0) return { calories: null, method: 'Completed strength session has no reliable duration', confidence: 'unavailable' }
  let seconds = minutes * 60
  let removed = 0
  const startedAt = session.started_at ? new Date(session.started_at).getTime() : Number.NaN
  if (!Number.isNaN(startedAt) && cardioIntervals.length) {
    removed = Math.min(seconds, overlapSeconds([startedAt, startedAt + seconds * 1000], mergeIntervals(cardioIntervals)))
    seconds -= removed
  }
  return {
    calories: activeCaloriesFromMet(MET.strength, weightKg, seconds),
    method: removed > 0
      ? `Assumed intensity: resistance training (3.5 MET); ${Math.round(removed / 60)} min that overlapped recorded cardio were not counted twice`
      : 'Assumed intensity: resistance training (3.5 MET) for the session duration',
    confidence: 'assumed_intensity',
    overlapSecondsRemoved: removed,
  }
}

export function calculateDailyCalories({
  date,
  profile,
  weights,
  foods,
  quickEntries,
  cardio,
  workouts,
}: {
  date: string
  profile: Pick<Profile, 'starting_weight_kg' | 'maintenance_calorie_target' | 'maintenance_includes_exercise'>
  weights: WeightEntry[]
  foods: FoodEntry[]
  quickEntries: CalorieIntakeEntry[]
  cardio: CardioSession[]
  workouts: WorkoutSession[]
}): DailyCalories {
  const weight = weightInfoForDate(date, weights, profile)
  const foodForDay = uniqueById(foods).filter((entry) => entry.entry_date === date)
  const quickForDay = uniqueById(quickEntries).filter((entry) => entry.entry_date === date)
  const foodCalories = foodForDay.reduce((sum, entry) => sum + Number(entry.calories), 0)
  const quickAddCalories = quickForDay.reduce((sum, entry) => sum + Number(entry.calories), 0)
  const hasIntake = foodForDay.length > 0 || quickForDay.length > 0
  const intakeCalories = hasIntake ? foodCalories + quickAddCalories : null

  // Each cardio record and each completed workout session is estimated exactly once,
  // and it is attributed to its session_date (the Asia/Kolkata date it STARTED).
  const cardioForDay = uniqueById(cardio).filter((session) => session.session_date === date)
  const workoutsForDay = uniqueById(workouts).filter((session) => session.session_date === date && isCompletedSession(session))
  const cardioIntervals = cardioForDay.map(cardioInterval).filter((interval): interval is Interval => interval != null)
  const cardioEstimates = cardioForDay.map((session) => estimateCardioActiveCalories(session, weight.kg))
  const strengthEstimates = workoutsForDay.map((session) => estimateStrengthActiveCalories(session, weight.kg, cardioIntervals))
  const all = [...cardioEstimates, ...strengthEstimates]
  const cardioCalories = cardioEstimates.reduce((sum, estimate) => sum + (estimate.calories ?? 0), 0)
  const strengthCalories = strengthEstimates.reduce((sum, estimate) => sum + (estimate.calories ?? 0), 0)
  const exerciseCalories = cardioCalories + strengthCalories

  const maintenance = profile.maintenance_calorie_target != null && profile.maintenance_calorie_target > 0 ? Number(profile.maintenance_calorie_target) : null
  const includesExercise = profile.maintenance_includes_exercise !== false
  const estimatedExpenditure = maintenance == null ? null : maintenance + (includesExercise ? 0 : exerciseCalories)
  const missingInputs: DailyCalories['missingInputs'] = []
  if (maintenance == null) missingInputs.push('maintenance')
  if (intakeCalories == null) missingInputs.push('intake')

  return {
    date,
    weightKg: weight.kg,
    weightSource: weight.source,
    foodCalories,
    foodEntryCount: foodForDay.length,
    quickAddCalories,
    quickAddEntryCount: quickForDay.length,
    intakeCalories,
    exerciseCalories,
    cardioCalories,
    strengthCalories,
    exerciseRecordCount: all.length,
    unavailableExerciseRecords: all.filter((estimate) => estimate.calories == null).length,
    assumedIntensityRecords: all.filter((estimate) => estimate.confidence === 'assumed_intensity').length,
    maintenanceCalories: maintenance,
    maintenanceIncludesExercise: includesExercise,
    estimatedExpenditure,
    estimatedBalance: estimatedExpenditure != null && intakeCalories != null ? estimatedExpenditure - intakeCalories : null,
    missingInputs,
  }
}

// ---------------------------------------------------------------------------
// Ring helpers
// ---------------------------------------------------------------------------

/** Percent of goal reached (unclamped, ≥ 0). 0 when there is no usable goal. */
export function calorieProgress(value: number | null, goal: number | null | undefined) {
  if (value == null || !goal || goal <= 0) return 0
  return Math.max(0, value / goal * 100)
}

/** The label shown inside a ring. Floored so "99.6%" never reads as 100% and the colour band agrees with the text. */
export const percentLabel = (percent: number) => `${Math.floor(percent + 1e-9)}%`

export const RING_COLORS = {
  red: '#c86b62',
  orange: '#d99451',
  yellow: '#c5a94c',
  lightGreen: '#8daa91',
  green: '#4f7a57',
} as const

/** Exercise ring: <25 red, 25–49 orange, 50–74 yellow, 75–99 light green, ≥100 green. */
export function calorieProgressColor(percent: number) {
  const whole = Math.floor(percent + 1e-9)
  if (whole < 25) return RING_COLORS.red
  if (whole < 50) return RING_COLORS.orange
  if (whole < 75) return RING_COLORS.yellow
  if (whole < 100) return RING_COLORS.lightGreen
  return RING_COLORS.green
}

/**
 * Progress toward the configured balance target. The target is signed:
 * positive = deficit goal, negative = surplus goal, 0 or missing = no ring goal.
 * Moving the wrong way (a surplus when aiming for a deficit) reads as 0%.
 */
export function balanceProgress(balance: number | null, target: number | null | undefined) {
  if (balance == null || target == null || target === 0) return null
  return target > 0 ? Math.max(0, balance) / target * 100 : Math.max(0, -balance) / -target * 100
}

export const describeBalance = (balance: number | null) =>
  balance == null ? 'unavailable' : balance > 0 ? 'deficit' : balance < 0 ? 'surplus' : 'at maintenance'
