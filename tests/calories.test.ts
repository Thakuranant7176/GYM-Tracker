import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeCaloriesFromMet,
  balanceProgress,
  calculateDailyCalories,
  calorieProgress,
  calorieProgressColor,
  describeBalance,
  estimateCardioActiveCalories,
  estimateStrengthActiveCalories,
  percentLabel,
  RING_COLORS,
  weightInfoForDate,
} from '../src/calories'
import { cardio, food, profile, quick, weight, workout } from './fixtures'

const day = '2026-10-30'
const base = { date: day, profile: profile(), weights: [], foods: [], quickEntries: [], cardio: [], workouts: [] }

// ---- exercise estimates and rounding ---------------------------------------------------
test('treadmill estimates follow the ACSM equations (hand-checked values)', () => {
  const walking = cardio({ session_date: day, average_speed_kmh: 6, incline_percent: 0 })
  assert.equal(estimateCardioActiveCalories(walking, 70).calories, 105) // net 10 ml/kg/min
  const incline = cardio({ session_date: day, average_speed_kmh: 6, incline_percent: 10 })
  assert.equal(estimateCardioActiveCalories(incline, 70).calories, 294)
  const running = cardio({ session_date: day, average_speed_kmh: 12, incline_percent: 0 })
  assert.equal(estimateCardioActiveCalories(running, 70).calories, 420)
  assert.equal(estimateCardioActiveCalories(running, 70).confidence, 'speed_based')
})

test('speed is derived from distance when no speed was recorded', () => {
  const estimate = estimateCardioActiveCalories(cardio({ session_date: day, distance_km: 3 }), 70)
  assert.equal(estimate.calories, 105)
  assert.equal(estimate.confidence, 'speed_based')
})

test('a treadmill session with no speed or distance is an assumed-intensity estimate, not a precise one', () => {
  const estimate = estimateCardioActiveCalories(cardio({ session_date: day }), 70)
  assert.equal(estimate.calories, 147)
  assert.equal(estimate.confidence, 'assumed_intensity')
  assert.match(estimate.method, /assumed/i)
})

test('implausible treadmill speeds are rejected instead of inflating the total', () => {
  const estimate = estimateCardioActiveCalories(cardio({ session_date: day, average_speed_kmh: 40 }), 70)
  assert.equal(estimate.calories, null)
  assert.equal(estimate.confidence, 'unavailable')
})

test('cycling, walking and other cardio', () => {
  assert.equal(estimateCardioActiveCalories(cardio({ session_date: day, activity_type: 'cycling' }), 70).calories, 213)
  assert.equal(estimateCardioActiveCalories(cardio({ session_date: day, activity_type: 'walking' }), 70).calories, 92)
  const machine = estimateCardioActiveCalories(cardio({ session_date: day, activity_type: 'other', machine_calories: 180 }), 70)
  assert.equal(machine.calories, 180)
  assert.equal(machine.confidence, 'machine_reported')
  assert.equal(estimateCardioActiveCalories(cardio({ session_date: day, activity_type: 'other' }), 70).calories, null)
})

test('no estimate is made without a body weight or a duration', () => {
  assert.equal(estimateCardioActiveCalories(cardio({ session_date: day }), null).calories, null)
  assert.equal(estimateCardioActiveCalories(cardio({ session_date: day, active_seconds: 0 }), 70).calories, null)
  assert.equal(estimateStrengthActiveCalories(workout({ session_date: day }), null).calories, null)
  assert.equal(estimateStrengthActiveCalories(workout({ session_date: day, total_duration_minutes: null }), 70).calories, null)
})

test('strength uses duration only, never sets and reps', () => {
  const estimate = estimateStrengthActiveCalories(workout({ session_date: day, total_duration_minutes: 45 }), 70)
  assert.equal(estimate.calories, 138) // 2.5 net MET x 3.5 x 70 kg x 45 min / 200 = 137.8
  assert.equal(estimate.confidence, 'assumed_intensity')
})

test('rounding is to whole kcal and never negative', () => {
  assert.equal(activeCaloriesFromMet(6.8, 70, 1800), 213)
  assert.equal(activeCaloriesFromMet(1, 70, 1800), 0)
  assert.equal(activeCaloriesFromMet(0.5, 70, 1800), 0)
})

// ---- body weight -----------------------------------------------------------------------
test('body weight is the latest weigh-in on or before the day, else the starting weight (flagged)', () => {
  const weights = [weight('2026-10-01', 72), weight('2026-10-20', 71), weight('2026-11-05', 70)]
  assert.deepEqual(weightInfoForDate('2026-10-30', weights, { starting_weight_kg: 75 }), { kg: 71, source: 'measured' })
  assert.deepEqual(weightInfoForDate('2026-09-01', weights, { starting_weight_kg: 75 }), { kg: 75, source: 'starting_weight' })
  assert.deepEqual(weightInfoForDate('2026-09-01', [], { starting_weight_kg: null }), { kg: null, source: null })
})

// ---- daily totals: nothing, missing vs zero ---------------------------------------------
test('a day with no activity and no intake is empty, not zero', () => {
  const result = calculateDailyCalories(base)
  assert.equal(result.exerciseCalories, 0)
  assert.equal(result.exerciseRecordCount, 0)
  assert.equal(result.intakeCalories, null)
  assert.equal(result.estimatedBalance, null)
  assert.deepEqual(result.missingInputs, ['intake'])
})

test('intake = food log + quick-add, only for that date; a recorded 0 is not "missing"', () => {
  const result = calculateDailyCalories({ ...base, foods: [food(day, 400), food('2026-10-29', 900)], quickEntries: [quick(day, 650), quick('2026-10-31', 100)] })
  assert.equal(result.foodCalories, 400)
  assert.equal(result.quickAddCalories, 650)
  assert.equal(result.intakeCalories, 1050)
  const zero = calculateDailyCalories({ ...base, quickEntries: [quick(day, 0, { source: 'set' })] })
  assert.equal(zero.intakeCalories, 0)
  assert.deepEqual(zero.missingInputs, [])
  assert.equal(zero.estimatedBalance, 2500)
})

test('repeated rows with the same id are counted once', () => {
  const entry = quick(day, 500)
  const row = cardio({ session_date: day, average_speed_kmh: 6, incline_percent: 0 })
  const result = calculateDailyCalories({ ...base, quickEntries: [entry, entry], cardio: [row, row] })
  assert.equal(result.intakeCalories, 500)
  assert.equal(result.cardioCalories, 105)
  assert.equal(result.exerciseRecordCount, 1)
})

// ---- double counting -------------------------------------------------------------------
test('only completed sessions count; discarded, in-progress and legacy rows behave correctly', () => {
  const workouts = [
    workout({ session_date: day, status: 'completed' }),
    workout({ session_date: day, status: 'in_progress' }),
    workout({ session_date: day, status: 'discarded' }),
    { ...workout({ session_date: day }), status: undefined, completed: true } as unknown as ReturnType<typeof workout>, // pre-migration row
    { ...workout({ session_date: day }), status: undefined, completed: false } as unknown as ReturnType<typeof workout>,
  ]
  const result = calculateDailyCalories({ ...base, workouts })
  assert.equal(result.exerciseRecordCount, 2) // the completed one and the legacy completed one
})

test('strength time that overlaps recorded cardio is not counted twice', () => {
  const strength = workout({ session_date: day, total_duration_minutes: 60, started_at: '2026-10-30T04:30:00Z' })
  const run = cardio({ session_date: day, started_at: '2026-10-30T05:00:00Z', active_seconds: 1200, average_speed_kmh: 6 })
  const result = calculateDailyCalories({ ...base, workouts: [strength], cardio: [run] })
  assert.equal(result.strengthCalories, activeCaloriesFromMet(3.5, 70, 40 * 60)) // 20 of 60 minutes overlap
  assert.equal(result.cardioCalories, estimateCardioActiveCalories(run, 70).calories)
})

test('overlapping cardio records are merged before subtracting from strength', () => {
  const strength = workout({ session_date: day, total_duration_minutes: 60, started_at: '2026-10-30T04:30:00Z' })
  const a = cardio({ session_date: day, started_at: '2026-10-30T05:00:00Z', active_seconds: 1200, average_speed_kmh: 6 })
  const b = cardio({ session_date: day, started_at: '2026-10-30T05:10:00Z', active_seconds: 1200, average_speed_kmh: 6 })
  const result = calculateDailyCalories({ ...base, workouts: [strength], cardio: [a, b] })
  assert.equal(result.strengthCalories, activeCaloriesFromMet(3.5, 70, 30 * 60)) // union 05:00-05:30
})

test('a workout is attributed to the IST date it started, even if it finished after midnight', () => {
  const crossing = workout({ session_date: '2026-10-30', total_duration_minutes: 90, started_at: '2026-10-30T18:00:00Z', completed_at: '2026-10-30T19:30:00Z' })
  const onStartDay = calculateDailyCalories({ ...base, date: '2026-10-30', workouts: [crossing] })
  const nextDay = calculateDailyCalories({ ...base, date: '2026-10-31', workouts: [crossing] })
  assert.equal(onStartDay.strengthCalories, activeCaloriesFromMet(3.5, 70, 90 * 60))
  assert.equal(nextDay.strengthCalories, 0)
  assert.equal(nextDay.exerciseRecordCount, 0)
})

// ---- balance ---------------------------------------------------------------------------
test('balance = expenditure - intake; positive is a deficit, negative a surplus', () => {
  const deficit = calculateDailyCalories({ ...base, quickEntries: [quick(day, 2000)] })
  assert.equal(deficit.estimatedBalance, 500)
  assert.equal(describeBalance(deficit.estimatedBalance), 'deficit')
  const surplus = calculateDailyCalories({ ...base, quickEntries: [quick(day, 3000)] })
  assert.equal(surplus.estimatedBalance, -500)
  assert.equal(describeBalance(surplus.estimatedBalance), 'surplus')
  assert.equal(describeBalance(0), 'at maintenance')
  assert.equal(describeBalance(null), 'unavailable')
})

test('exercise is NOT subtracted from food, and not added when maintenance already includes it', () => {
  const run = cardio({ session_date: day, average_speed_kmh: 6, incline_percent: 0 }) // 105 kcal
  const included = calculateDailyCalories({ ...base, cardio: [run], quickEntries: [quick(day, 2000)] })
  assert.equal(included.estimatedExpenditure, 2500)
  assert.equal(included.estimatedBalance, 500)
  const excluded = calculateDailyCalories({ ...base, profile: profile({ maintenance_includes_exercise: false }), cardio: [run], quickEntries: [quick(day, 2000)] })
  assert.equal(excluded.estimatedExpenditure, 2605)
  assert.equal(excluded.estimatedBalance, 605)
})

test('missing maintenance or intake is reported, never invented', () => {
  const noMaintenance = calculateDailyCalories({ ...base, profile: profile({ maintenance_calorie_target: null }), quickEntries: [quick(day, 2000)] })
  assert.equal(noMaintenance.estimatedBalance, null)
  assert.deepEqual(noMaintenance.missingInputs, ['maintenance'])
  const neither = calculateDailyCalories({ ...base, profile: profile({ maintenance_calorie_target: null }) })
  assert.deepEqual(neither.missingInputs, ['maintenance', 'intake'])
})

// ---- ring colours, labels, progress -----------------------------------------------------
test('exercise ring colours at every band boundary', () => {
  const cases: Array<[number, string]> = [
    [0, RING_COLORS.red], [24.99, RING_COLORS.red], [25, RING_COLORS.orange], [49.99, RING_COLORS.orange],
    [50, RING_COLORS.yellow], [74.99, RING_COLORS.yellow], [75, RING_COLORS.lightGreen], [99.99, RING_COLORS.lightGreen],
    [100, RING_COLORS.green], [250, RING_COLORS.green],
  ]
  for (const [percent, color] of cases) assert.equal(calorieProgressColor(percent), color, `${percent}%`)
})

test('percent labels are floored so the text always agrees with the colour band', () => {
  assert.equal(percentLabel(99.6), '99%')
  assert.equal(percentLabel(24.99), '24%')
  assert.equal(percentLabel(100), '100%')
  assert.equal(percentLabel(0), '0%')
  assert.equal(calorieProgressColor(99.6), RING_COLORS.lightGreen)
})

test('progress handles missing goals and goals of zero', () => {
  assert.equal(calorieProgress(300, 500), 60)
  assert.equal(calorieProgress(300, null), 0)
  assert.equal(calorieProgress(300, 0), 0)
  assert.equal(calorieProgress(null, 500), 0)
  assert.equal(calorieProgress(750, 500), 150)
})

test('balance progress for deficit and surplus targets', () => {
  assert.equal(balanceProgress(250, 500), 50)
  assert.equal(balanceProgress(-100, 500), 0) // surplus while aiming for a deficit
  assert.equal(balanceProgress(-150, -300), 50) // surplus target
  assert.equal(balanceProgress(100, -300), 0)
  assert.equal(balanceProgress(250, 0), null)
  assert.equal(balanceProgress(250, null), null)
  assert.equal(balanceProgress(null, 500), null)
})
