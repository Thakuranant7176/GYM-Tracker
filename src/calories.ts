import { addDays } from './lib'
import type { CardioSession, DailyCalorieTotal, FoodEntry, Profile, WeightEntry, WorkoutSession } from './types'

export const CALORIE_METHODOLOGY = [
  'Cardio active calories use body weight, duration, and a MET estimate. Treadmill entries use the ACSM walking or running equation when speed is available; recorded distance can supply speed when duration is known. Otherwise the tracker uses conservative, documented activity-type MET defaults.',
  'Strength active calories use a 3.5 MET moderate-resistance estimate only when a completed session has a recorded duration. Strength sessions without a reliable duration are marked unavailable rather than guessed.',
  'Active calories subtract a 1 MET resting component where the calculation permits. Machine-reported calories are used only for “other” cardio when no defensible activity-specific model is available.',
  'Daily balance is maintenance calories plus recorded exercise only when maintenance is configured as excluding deliberate exercise. All calorie values are estimates, not measurements or weight-loss predictions.',
].join(' ')

export type ExerciseEstimate = {
  calories: number | null
  method: string
}

export type DailyCalories = {
  date: string
  weightKg: number | null
  foodCalories: number
  foodEntryCount: number
  manualTotal: DailyCalorieTotal | null
  intakeCalories: number | null
  exerciseCalories: number
  cardioCalories: number
  strengthCalories: number
  unavailableExerciseRecords: number
  estimatedExpenditure: number | null
  estimatedBalance: number | null
}

const rounded = (value: number) => Math.max(0, Math.round(value))

export function weightForDate(date: string, weights: WeightEntry[], profile: Profile) {
  const recorded = weights
    .filter((entry) => entry.entry_date <= date)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .at(-1)?.weight_kg
  return recorded ?? profile.starting_weight_kg ?? null
}

function activeCaloriesFromMet(met: number, weightKg: number, seconds: number) {
  const minutes = seconds / 60
  // kcal/min = MET × 3.5 × kg / 200. Subtract 1 MET to avoid counting rest.
  return rounded(Math.max(0, met - 1) * 3.5 * weightKg * minutes / 200)
}

function treadmillMet(session: CardioSession) {
  const minutes = session.active_seconds / 60
  const derivedSpeed = session.distance_km != null && minutes > 0
    ? Number(session.distance_km) / minutes * 60
    : null
  const speedKmh = session.average_speed_kmh ?? derivedSpeed
  if (speedKmh == null || speedKmh <= 0) return { met: 5, method: 'Conservative treadmill fallback (5 MET)' }
  const speedMetresPerMinute = speedKmh * 1000 / 60
  const grade = Number(session.incline_percent ?? 0) / 100
  const vo2 = speedMetresPerMinute <= 134
    ? 0.1 * speedMetresPerMinute + 1.8 * speedMetresPerMinute * grade + 3.5
    : 0.2 * speedMetresPerMinute + 0.9 * speedMetresPerMinute * grade + 3.5
  return { met: Math.max(1, vo2 / 3.5), method: 'ACSM treadmill equation' }
}

export function estimateCardioActiveCalories(session: CardioSession, weightKg: number | null): ExerciseEstimate {
  if (!weightKg || weightKg <= 0) return { calories: null, method: 'Body weight is required for an active-calorie estimate' }
  if (session.activity_type === 'treadmill') {
    const estimate = treadmillMet(session)
    return { calories: activeCaloriesFromMet(estimate.met, weightKg, session.active_seconds), method: estimate.method }
  }
  if (session.activity_type === 'cycling') return { calories: activeCaloriesFromMet(6.8, weightKg, session.active_seconds), method: 'Moderate cycling assumption (6.8 MET)' }
  if (session.activity_type === 'walking') return { calories: activeCaloriesFromMet(3.5, weightKg, session.active_seconds), method: 'Brisk walking assumption (3.5 MET)' }
  if (session.machine_calories != null) return { calories: rounded(session.machine_calories), method: 'Machine-reported calories; active/resting split is unavailable' }
  return { calories: null, method: 'Other cardio needs a machine-calorie reading or a supported activity type' }
}

export function estimateStrengthActiveCalories(session: WorkoutSession, weightKg: number | null): ExerciseEstimate {
  const duration = session.total_duration_minutes
  if (!weightKg || weightKg <= 0) return { calories: null, method: 'Body weight is required for an active-calorie estimate' }
  if (!duration || duration <= 0) return { calories: null, method: 'Completed strength session has no reliable duration' }
  return {
    calories: activeCaloriesFromMet(3.5, weightKg, duration * 60),
    method: 'Moderate resistance-training assumption (3.5 MET)',
  }
}

export function calculateDailyCalories({
  date,
  profile,
  weights,
  foods,
  manualTotals,
  cardio,
  workouts,
}: {
  date: string
  profile: Profile
  weights: WeightEntry[]
  foods: FoodEntry[]
  manualTotals: DailyCalorieTotal[]
  cardio: CardioSession[]
  workouts: WorkoutSession[]
}): DailyCalories {
  const weightKg = weightForDate(date, weights, profile)
  const foodForDay = foods.filter((entry) => entry.entry_date === date)
  const foodCalories = foodForDay.reduce((sum, entry) => sum + Number(entry.calories), 0)
  const manualTotal = manualTotals.find((entry) => entry.entry_date === date) ?? null
  // A saved manual total intentionally represents the entire day and supersedes
  // the meal-item sum. This prevents a manual daily total from double-counting
  // detailed entries the user may also keep for macros.
  const intakeCalories = manualTotal ? Number(manualTotal.calories) : foodForDay.length ? foodCalories : null
  const cardioEstimates = cardio
    .filter((session) => session.session_date === date)
    .map((session) => estimateCardioActiveCalories(session, weightKg))
  const strengthEstimates = workouts
    .filter((session) => session.session_date === date && (session.status === 'completed' || session.completed))
    .map((session) => estimateStrengthActiveCalories(session, weightKg))
  const allEstimates = [...cardioEstimates, ...strengthEstimates]
  const cardioCalories = cardioEstimates.reduce((sum, estimate) => sum + Number(estimate.calories ?? 0), 0)
  const strengthCalories = strengthEstimates.reduce((sum, estimate) => sum + Number(estimate.calories ?? 0), 0)
  const exerciseCalories = cardioCalories + strengthCalories
  const maintenance = profile.maintenance_calorie_target
  const estimatedExpenditure = maintenance && maintenance > 0
    ? maintenance + (profile.maintenance_includes_exercise ? 0 : exerciseCalories)
    : null
  return {
    date,
    weightKg,
    foodCalories,
    foodEntryCount: foodForDay.length,
    manualTotal,
    intakeCalories,
    exerciseCalories,
    cardioCalories,
    strengthCalories,
    unavailableExerciseRecords: allEstimates.filter((estimate) => estimate.calories == null).length,
    estimatedExpenditure,
    estimatedBalance: estimatedExpenditure != null && intakeCalories != null ? estimatedExpenditure - intakeCalories : null,
  }
}

export function monthDates(month: string) {
  const start = `${month}-01`
  const nextMonth = new Date(`${start}T12:00:00+05:30`)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const end = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000))
  const dates: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date)
  return { start, end, dates }
}

export function mostRecentCompletedMonth(now = new Date()) {
  const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  firstOfCurrentMonth.setDate(0)
  return `${firstOfCurrentMonth.getFullYear()}-${String(firstOfCurrentMonth.getMonth() + 1).padStart(2, '0')}`
}

export function calorieProgress(value: number | null, goal: number | null | undefined) {
  if (value == null || !goal || goal <= 0) return 0
  return Math.max(0, value / goal * 100)
}

export function calorieProgressColor(percent: number) {
  if (percent < 25) return '#c86b62'
  if (percent < 50) return '#d99451'
  if (percent < 75) return '#c5a94c'
  if (percent < 100) return '#8daa91'
  return '#4f7a57'
}
