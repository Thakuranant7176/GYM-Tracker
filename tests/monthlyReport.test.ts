import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMonthlyReport, monthlyReportMarkdown, REPORT_SCHEMA, REPORT_SCHEMA_VERSION, type MonthlyReportInput } from '../src/monthlyReport'
import { cardio, exercise, food, OTHER, profile, quick, set, USER, weight, workout } from './fixtures'

const NOW = new Date('2026-10-30T06:00:00Z')
const bench = exercise('ex-bench', 'Bench Press')
const squat = exercise('ex-squat', 'Back Squat')

const empty = (): MonthlyReportInput => ({ userId: USER, profile: profile(), weights: [], foods: [], quickEntries: [], cardio: [], workouts: [], sets: [], exercises: [bench, squat] })

/** September 2026 for USER, plus rows that must NOT appear (other user, unfinished, other months). */
function september(): MonthlyReportInput {
  const prior = workout({ id: 'w-prior', session_date: '2026-08-20' })
  const w1 = workout({ id: 'w1', session_date: '2026-09-02', started_at: '2026-09-02T04:00:00Z', total_duration_minutes: 60 })
  const w2 = workout({ id: 'w2', session_date: '2026-09-03', total_duration_minutes: 50 })
  const discarded = workout({ id: 'w3', session_date: '2026-09-04', status: 'discarded' })
  const open = workout({ id: 'w4', session_date: '2026-09-05', status: 'in_progress' })
  const foreignSession = workout({ id: 'w-foreign', session_date: '2026-09-06', user_id: OTHER })
  return {
    ...empty(),
    profile: profile({ maintenance_calorie_target: 2500, maintenance_includes_exercise: true }),
    weights: [weight('2026-09-01', 72), weight('2026-09-08', 71.6), weight('2026-09-15', 71.3), weight('2026-09-22', 71.0), weight('2026-09-10', 40, { user_id: OTHER })],
    foods: [food('2026-09-02', 600, { protein_g: 30 })],
    quickEntries: [quick('2026-09-02', 400), quick('2026-09-03', 0, { source: 'set' }), quick('2026-09-03', 9999, { user_id: OTHER })],
    cardio: [
      cardio({ session_date: '2026-09-02', average_speed_kmh: 6, incline_percent: 0 }),
      cardio({ session_date: '2026-09-10', activity_type: 'other' }),
      cardio({ session_date: '2026-09-12', user_id: OTHER, average_speed_kmh: 6 }),
    ],
    workouts: [prior, w1, w2, discarded, open, foreignSession],
    sets: [
      set('w-prior', { exercise_id: 'ex-bench', weight_kg: 60, reps: 8 }),
      set('w1', { exercise_id: 'ex-bench', weight_kg: 70, reps: 8 }),
      set('w1', { exercise_id: 'ex-bench', weight_kg: 70, reps: 6, set_number: 2 }),
      set('w1', { exercise_id: 'ex-bench', weight_kg: 80, reps: 5, set_number: 3, completed: false }),
      set('w2', { exercise_id: 'ex-squat', weight_kg: 100, reps: 5 }),
      set('w2', { exercise_id: 'ex-squat', weight_kg: null, reps: 10, set_number: 2 }),
      set('w-foreign', { exercise_id: 'ex-bench', weight_kg: 200, reps: 1 }),
    ],
  }
}

const walk = (value: unknown, visit: (key: string | null, value: unknown) => void, key: string | null = null): void => {
  visit(key, value)
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit, null))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, visit, k)
}

test('the report carries its schema, version, generation time and reporting period', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  assert.equal(report.schema, REPORT_SCHEMA)
  assert.equal(report.schema_version, REPORT_SCHEMA_VERSION)
  assert.equal(report.generated_at, '2026-10-30T06:00:00.000Z')
  assert.equal(report.reporting_period.start_date, '2026-09-01')
  assert.equal(report.reporting_period.end_date, '2026-09-30')
  assert.equal(report.reporting_period.timezone, 'Asia/Kolkata')
  assert.equal(report.reporting_period.days_in_month, 30)
  assert.equal(report.reporting_period.days_covered, 30)
  assert.equal(report.reporting_period.is_partial, false)
})

test('only the current user’s completed work is counted', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  assert.equal(report.overview.recorded.completed_strength_sessions, 2) // discarded, in-progress, other-user and August rows excluded
  assert.equal(report.strength.sessions.length, 2)
  assert.equal(report.overview.recorded.cardio_sessions, 2) // the other user's cardio is excluded
  assert.equal(report.overview.recorded.training_days, 3) // 2 Sep, 3 Sep, 10 Sep
  assert.equal(report.overview.recorded.weigh_ins, 4)
})

test('another user’s records never appear anywhere in the output', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const json = JSON.stringify(report)
  assert.ok(!json.includes(OTHER))
  assert.ok(!json.includes('9999'))
  assert.ok(!json.includes('"weight_kg":40'))
  assert.equal(report.strength.personal_records.find((row) => row.exercise === 'Bench Press')?.heaviest_load_kg, 70) // not the foreign 200 kg
  const markdown = monthlyReportMarkdown(report)
  assert.ok(!markdown.includes(OTHER))
})

test('no identifiers, credentials or secrets are exported', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const forbidden = /password|token|secret|service_role|api_?key|email|user_id|^id$/i
  const keys: string[] = []
  walk(report, (key) => { if (key) keys.push(key) })
  assert.deepEqual(keys.filter((key) => forbidden.test(key)), [])
  assert.ok(!JSON.stringify(report).includes(USER))
})

test('missing data is null, never silently zero', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const byDate = Object.fromEntries(report.nutrition.daily.map((day) => [day.date, day]))
  assert.deepEqual(byDate['2026-09-02'], { date: '2026-09-02', recorded: true, intake_kcal: 1000, food_log_kcal: 600, quick_add_kcal: 400 })
  assert.equal(byDate['2026-09-03'].recorded, true) // an explicit 0 kcal day IS a measurement
  assert.equal(byDate['2026-09-03'].intake_kcal, 0)
  assert.equal(byDate['2026-09-04'].recorded, false) // nothing logged is NOT 0 kcal
  assert.equal(byDate['2026-09-04'].intake_kcal, null)
  const monthly = report.nutrition.monthly.recorded
  assert.equal(monthly.days_recorded, 2)
  assert.equal(monthly.days_not_recorded, 28)
  assert.equal(monthly.total_intake_kcal_on_recorded_days, 1000)
  assert.equal(monthly.average_intake_kcal_per_recorded_day, 500) // averaged over recorded days only
  assert.equal(monthly.food_log_macros_g.protein, 30)
  assert.equal(monthly.food_log_macros_g.carbs, null) // never entered, so unknown
  assert.equal(monthly.food_log_macros_g.food_entries_missing_a_macro, 1)
  assert.equal(report.data_quality.days_without_intake.length, 28)
  assert.ok(report.data_quality.days_without_intake.includes('2026-09-04'))
})

test('strength: sets, reps, loads, volume and personal records', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const session = report.strength.sessions.find((row) => row.date === '2026-09-02')
  assert.equal(session?.recorded.completed_sets, 2) // the unfinished 80 kg set is excluded
  assert.equal(session?.recorded.total_reps, 14)
  assert.equal(session?.recorded.volume_kg, 980) // 70x8 + 70x6
  const bench = report.strength.personal_records.find((row) => row.exercise === 'Bench Press')
  assert.equal(bench?.heaviest_load_kg, 70)
  assert.equal(bench?.previous_best_kg, 60)
  assert.equal(bench?.is_new_personal_record, true)
  const squat = report.strength.personal_records.find((row) => row.exercise === 'Back Squat')
  assert.equal(squat?.is_new_personal_record, false)
  assert.equal(squat?.first_recorded_load, true)
  const squatRow = report.strength.by_exercise.find((row) => row.exercise === 'Back Squat')
  assert.equal(squatRow?.completed_sets, 2)
  assert.equal(squatRow?.sets_without_recorded_load, 1) // the bodyweight set adds reps but no volume
  assert.equal(squatRow?.volume_kg, 500)
})

test('cardio: recorded metrics and estimates are kept separate; unestimable sessions stay null', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const [walk, other] = report.cardio.sessions
  assert.equal(walk.recorded.average_speed_kmh, 6)
  // 6 km/h level walk = 10 ml/kg/min above rest; the 1 Sep weigh-in is 72 kg: 10 x 72 x 5 / 1000 x 30 min = 108 kcal
  assert.equal(walk.estimate.active_kcal, 108)
  assert.equal(other.estimate.active_kcal, null)
  assert.equal(report.cardio.totals.estimate.sessions_without_estimate, 1)
  assert.equal(report.cardio.totals.recorded.distance_km, null) // no distances were recorded
  assert.equal(report.overview.recorded.cardio_active_minutes, 60)
})

test('balance uses expenditure minus intake and skips days without intake', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const byDate = Object.fromEntries(report.calorie_balance.daily.map((day) => [day.date, day]))
  assert.equal(byDate['2026-09-02'].estimated_balance_kcal, 1500) // 2500 - 1000
  assert.equal(byDate['2026-09-02'].estimated_balance_kind, 'deficit')
  assert.equal(byDate['2026-09-03'].estimated_balance_kcal, 2500)
  assert.equal(byDate['2026-09-04'].estimated_balance_kcal, null)
  const monthly = report.calorie_balance.monthly.estimate
  assert.equal(monthly.days_with_balance, 2)
  assert.equal(monthly.total_balance_kcal, 4000)
  assert.equal(monthly.average_balance_kcal_per_day, 2000)
  assert.equal(monthly.deficit_days, 2)
  assert.equal(monthly.surplus_days, 0)
})

test('weight entries, change and trend', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const body = report.body_weight
  assert.equal(body.recorded.first_kg, 72)
  assert.equal(body.recorded.last_kg, 71)
  assert.equal(body.recorded.change_first_to_last_kg, -1)
  assert.equal(body.estimate.trend_kg_per_week, -0.33)
})

test('consistency: streaks and weekly training days', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  assert.equal(report.consistency.longest_streak_days, 2) // 2 and 3 Sep
  assert.equal(report.consistency.training_days, 3)
  assert.equal(report.consistency.training_day_share_percent, 10)
  assert.ok(report.consistency.training_days_per_week.length >= 2)
})

test('an empty month is valid: gaps, not zeros, and no NaN', () => {
  const report = buildMonthlyReport(empty(), '2026-05', { now: NOW })
  assert.equal(report.overview.recorded.training_days, 0)
  assert.equal(report.nutrition.monthly.recorded.total_intake_kcal_on_recorded_days, null)
  assert.equal(report.nutrition.monthly.recorded.average_intake_kcal_per_recorded_day, null)
  assert.equal(report.nutrition.monthly.recorded.days_recorded, 0)
  assert.equal(report.body_weight.recorded.change_first_to_last_kg, null)
  assert.equal(report.body_weight.estimate.trend_kg_per_week, null)
  assert.equal(report.calorie_balance.monthly.estimate.total_balance_kcal, null)
  assert.equal(report.cardio.totals.recorded.distance_km, null)
  assert.equal(report.data_quality.has_weigh_in_this_month, false)
  assert.equal(report.data_quality.days_without_intake.length, 31)
  walk(report, (_key, value) => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'every number must be finite')
  })
  const markdown = monthlyReportMarkdown(report)
  assert.ok(markdown.includes('_None recorded._'))
  assert.ok(!markdown.includes('NaN'))
  assert.ok(!markdown.includes('undefined'))
})

test('a month in progress covers days up to today and does not count the future as gaps', () => {
  const input = { ...empty(), cardio: [cardio({ session_date: '2026-10-13' }), cardio({ session_date: '2026-10-14' })] }
  const report = buildMonthlyReport(input, '2026-10', { now: NOW, asOfDate: '2026-10-15' })
  assert.equal(report.reporting_period.is_partial, true)
  assert.equal(report.reporting_period.days_covered, 15)
  assert.equal(report.reporting_period.last_day_included, '2026-10-15')
  assert.equal(report.data_quality.days_without_intake.length, 15)
  assert.equal(report.nutrition.daily.length, 15)
  assert.equal(report.calorie_balance.daily.length, 15)
  // Nothing logged yet today must not break a streak that ran through yesterday.
  assert.equal(report.consistency.streak_at_end_of_period_days, 2)
})

test('a month that has not started yet reports nothing and says so', () => {
  const report = buildMonthlyReport(empty(), '2026-11', { now: NOW, asOfDate: '2026-10-15' })
  assert.equal(report.reporting_period.days_covered, 0)
  assert.equal(report.reporting_period.is_partial, true)
  assert.match(report.reporting_period.note, /not started/i)
  assert.equal(report.nutrition.daily.length, 0)
})

test('a workout that crosses midnight belongs to the month it started in', () => {
  const crossing = workout({ id: 'w-cross', session_date: '2026-09-30', started_at: '2026-09-30T18:00:00Z', completed_at: '2026-09-30T19:30:00Z', total_duration_minutes: 90 })
  const input = { ...empty(), workouts: [crossing] }
  assert.equal(buildMonthlyReport(input, '2026-09', { now: NOW }).overview.recorded.completed_strength_sessions, 1)
  assert.equal(buildMonthlyReport(input, '2026-10', { now: NOW, asOfDate: '2026-10-30' }).overview.recorded.completed_strength_sessions, 0)
})

test('the assumptions are documented in the report', () => {
  const report = buildMonthlyReport(september(), '2026-09', { now: NOW })
  const text = report.data_quality.assumptions.join(' ')
  assert.match(text, /MET/)
  assert.match(text, /ACSM/)
  assert.match(text, /double/i)
  assert.match(text, /started/i)
  assert.match(text, /Discarded/)
  assert.equal(report.calorie_balance.monthly.convention, 'Balance = estimated expenditure − calories consumed. Positive = deficit, negative = surplus.')
})

test('the Markdown report is readable and escapes table separators', () => {
  const input = september()
  input.exercises = [exercise('ex-bench', 'Bench | Press'), squat]
  const markdown = monthlyReportMarkdown(buildMonthlyReport(input, '2026-09', { now: NOW }))
  assert.ok(markdown.startsWith('# Gym Ledger monthly report — 2026-09'))
  assert.ok(markdown.includes('New personal record'))
  assert.ok(markdown.includes('Bench \\| Press'))
  assert.ok(markdown.includes('## Data gaps and assumptions'))
  assert.ok(!markdown.includes('undefined'))
  assert.ok(!markdown.includes('NaN'))
})
