import {
  calculateDailyCalories,
  CALORIE_METHODOLOGY_LIST,
  cardioInterval,
  estimateCardioActiveCalories,
  estimateStrengthActiveCalories,
  weightInfoForDate,
} from './calories'
import { addDays, monthDates, shiftMonth, startOfWeek, todayISO } from './lib'
import { isCompletedSession } from './workoutLifecycle'
import type { CalorieIntakeEntry, CardioSession, Exercise, FoodEntry, Profile, WeightEntry, WorkoutSession, WorkoutSet } from './types'

export const REPORT_SCHEMA = 'gym-ledger/monthly-report'
export const REPORT_SCHEMA_VERSION = 1

export type MonthlyReportInput = {
  /** The signed-in user. Rows that carry a different user_id are dropped as a second line of defence behind RLS. */
  userId: string
  profile: Profile
  weights: WeightEntry[]
  foods: FoodEntry[]
  quickEntries: CalorieIntakeEntry[]
  cardio: CardioSession[]
  workouts: WorkoutSession[]
  sets: WorkoutSet[]
  exercises: Exercise[]
}

const sum = (values: Array<number | null | undefined>) => values.reduce<number>((total, value) => total + Number(value ?? 0), 0)
const round = (value: number, digits = 1) => Number(value.toFixed(digits))
const average = (values: number[]) => (values.length ? sum(values) / values.length : null)
const owned = <T extends { user_id?: string }>(rows: T[], userId: string) => rows.filter((row) => row.user_id == null || row.user_id === userId)

function streaks(activeDates: Set<string>, dates: string[], endDate: string, endsToday: boolean) {
  let longest = 0
  let run = 0
  for (const date of dates) {
    run = activeDates.has(date) ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  // A month in progress is not penalised for "today" not having a workout yet.
  let cursor = endsToday && !activeDates.has(endDate) ? addDays(endDate, -1) : endDate
  let current = 0
  while (activeDates.has(cursor) && cursor >= dates[0]) {
    current += 1
    cursor = addDays(cursor, -1)
  }
  return { longest, current }
}

/** Least-squares slope in kg per week; only with ≥ 3 weigh-ins spanning ≥ 6 days. */
function weightTrendPerWeek(entries: WeightEntry[]) {
  if (entries.length < 3) return null
  const base = entries[0].entry_date
  const xs = entries.map((entry) => (Date.parse(`${entry.entry_date}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000)
  if (xs[xs.length - 1] < 6) return null
  const ys = entries.map((entry) => Number(entry.weight_kg))
  const mx = sum(xs) / xs.length
  const my = sum(ys) / ys.length
  const denominator = sum(xs.map((x) => (x - mx) ** 2))
  if (denominator === 0) return null
  return round(sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / denominator * 7, 2)
}

export function buildMonthlyReport(rawInput: MonthlyReportInput, month: string, options: { now?: Date; asOfDate?: string } = {}) {
  const generatedAt = (options.now ?? new Date()).toISOString()
  const asOf = options.asOfDate ?? todayISO(options.now ?? new Date())
  const { userId } = rawInput
  const input = {
    ...rawInput,
    weights: owned(rawInput.weights, userId),
    foods: owned(rawInput.foods, userId),
    quickEntries: owned(rawInput.quickEntries, userId),
    cardio: owned(rawInput.cardio, userId),
    workouts: owned(rawInput.workouts, userId),
    sets: owned(rawInput.sets, userId),
  }
  const { start, end, dates: allDates } = monthDates(month)
  const lastDay = asOf < start ? start : asOf < end ? asOf : end
  const isFuture = asOf < start
  const dates = isFuture ? [] : allDates.filter((date) => date <= lastDay)
  const partial = !isFuture && lastDay < end
  const inMonth = (date: string) => date >= start && date <= end

  const exerciseName = (id: string | null) => input.exercises.find((exercise) => exercise.id === id)?.name ?? 'Unknown or archived exercise'
  const sessions = input.workouts.filter((session) => isCompletedSession(session) && inMonth(session.session_date)).sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.started_at ?? '').localeCompare(b.started_at ?? ''))
  const sessionIds = new Set(sessions.map((session) => session.id))
  const monthSets = input.sets.filter((set) => sessionIds.has(set.workout_session_id))
  const cardio = input.cardio.filter((session) => inMonth(session.session_date)).sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.started_at ?? '').localeCompare(b.started_at ?? ''))
  const weights = input.weights.filter((entry) => inMonth(entry.entry_date)).sort((a, b) => a.entry_date.localeCompare(b.entry_date))

  // --- daily rows (exercise estimate, intake, balance) ------------------------
  const daily = dates.map((date) => {
    const result = calculateDailyCalories({ date, profile: input.profile, weights: input.weights, foods: input.foods, quickEntries: input.quickEntries, cardio: input.cardio, workouts: input.workouts })
    return {
      date,
      intake_recorded: result.intakeCalories != null,
      intake_kcal: result.intakeCalories,
      intake_food_log_kcal: result.foodEntryCount ? result.foodCalories : null,
      intake_quick_add_kcal: result.quickAddEntryCount ? result.quickAddCalories : null,
      estimated_exercise_kcal: result.exerciseCalories,
      exercise_records: result.exerciseRecordCount,
      exercise_records_without_estimate: result.unavailableExerciseRecords,
      estimated_expenditure_kcal: result.estimatedExpenditure,
      estimated_balance_kcal: result.estimatedBalance,
      estimated_balance_kind: result.estimatedBalance == null ? null : result.estimatedBalance > 0 ? 'deficit' : result.estimatedBalance < 0 ? 'surplus' : 'maintenance',
    }
  })

  // --- cardio -------------------------------------------------------------------
  const cardioRows = cardio.map((session) => {
    const estimate = estimateCardioActiveCalories(session, weightInfoForDate(session.session_date, input.weights, input.profile).kg)
    return {
      date: session.session_date,
      activity_type: session.activity_type,
      recorded: {
        active_minutes: round(session.active_seconds / 60),
        paused_minutes: session.paused_seconds == null ? null : round(session.paused_seconds / 60),
        distance_km: session.distance_km,
        average_speed_kmh: session.average_speed_kmh,
        incline_percent: session.incline_percent,
        heart_rate_bpm: session.heart_rate_bpm,
        machine_calories_kcal: session.machine_calories,
      },
      estimate: { active_kcal: estimate.calories, method: estimate.method, confidence: estimate.confidence },
    }
  })

  // --- strength -------------------------------------------------------------------
  const byExercise = new Map<string, { name: string; sets: number; reps: number; volume: number; best: number | null; setsNoLoad: number }>()
  const strengthRows = sessions.map((session) => {
    const cardioToday = input.cardio.filter((entry) => entry.session_date === session.session_date)
    const estimate = estimateStrengthActiveCalories(session, weightInfoForDate(session.session_date, input.weights, input.profile).kg, cardioToday.map(cardioInterval).filter((value): value is [number, number] => value != null))
    const done = monthSets.filter((set) => set.workout_session_id === session.id && set.completed)
    const exerciseRows = new Map<string, { sets: number; reps: number; volume: number; best: number | null }>()
    for (const set of done) {
      const key = set.exercise_id ?? 'unknown'
      const reps = Number(set.reps ?? 0)
      const load = set.weight_kg == null ? null : Number(set.weight_kg)
      const volume = load != null ? load * reps : 0
      const row = exerciseRows.get(key) ?? { sets: 0, reps: 0, volume: 0, best: null }
      row.sets += 1
      row.reps += reps
      row.volume += volume
      if (load != null && (row.best == null || load > row.best)) row.best = load
      exerciseRows.set(key, row)
      const total = byExercise.get(key) ?? { name: exerciseName(set.exercise_id), sets: 0, reps: 0, volume: 0, best: null, setsNoLoad: 0 }
      total.sets += 1
      total.reps += reps
      total.volume += volume
      if (load == null) total.setsNoLoad += 1
      if (load != null && (total.best == null || load > total.best)) total.best = load
      byExercise.set(key, total)
    }
    return {
      date: session.session_date,
      title: session.title,
      started_at: session.started_at,
      completed_at: session.completed_at,
      recorded: {
        duration_minutes: session.total_duration_minutes,
        completed_sets: done.length,
        total_reps: sum(done.map((set) => set.reps)),
        volume_kg: round(sum(done.map((set) => (set.weight_kg == null ? 0 : Number(set.weight_kg) * Number(set.reps ?? 0))))),
        exercises: [...exerciseRows.entries()].map(([key, row]) => ({
          exercise: exerciseName(key === 'unknown' ? null : key),
          completed_sets: row.sets,
          total_reps: row.reps,
          heaviest_load_kg: row.best,
          volume_kg: round(row.volume),
        })),
      },
      estimate: { active_kcal: estimate.calories, method: estimate.method, confidence: estimate.confidence },
    }
  })

  // --- personal records: heaviest completed load this month vs all earlier history ---
  const completedBefore = new Set(input.workouts.filter((session) => isCompletedSession(session) && session.session_date < start).map((session) => session.id))
  const sessionDate = new Map(input.workouts.map((session) => [session.id, session.session_date]))
  const priorBest = new Map<string, number>()
  for (const set of input.sets) {
    if (!set.completed || set.weight_kg == null || !set.exercise_id || !completedBefore.has(set.workout_session_id)) continue
    priorBest.set(set.exercise_id, Math.max(priorBest.get(set.exercise_id) ?? 0, Number(set.weight_kg)))
  }
  const monthBest = new Map<string, { load: number; reps: number | null; date: string }>()
  for (const set of monthSets) {
    if (!set.completed || set.weight_kg == null || !set.exercise_id || Number(set.weight_kg) <= 0) continue
    const load = Number(set.weight_kg)
    const current = monthBest.get(set.exercise_id)
    if (!current || load > current.load) monthBest.set(set.exercise_id, { load, reps: set.reps, date: sessionDate.get(set.workout_session_id) ?? '' })
  }
  const personalRecords = [...monthBest.entries()].map(([id, best]) => {
    const previous = priorBest.get(id) ?? null
    return {
      exercise: exerciseName(id),
      heaviest_load_kg: best.load,
      reps_at_that_load: best.reps,
      date: best.date,
      previous_best_kg: previous,
      is_new_personal_record: previous != null && best.load > previous,
      first_recorded_load: previous == null,
    }
  }).sort((a, b) => a.exercise.localeCompare(b.exercise))

  // --- consistency ------------------------------------------------------------------
  const activeDates = new Set([...sessions.map((session) => session.session_date), ...cardio.map((session) => session.session_date)])
  const streak = dates.length ? streaks(activeDates, dates, lastDay, asOf === lastDay) : { longest: 0, current: 0 }
  const weekly = new Map<string, number>()
  for (const date of activeDates) weekly.set(startOfWeek(date), (weekly.get(startOfWeek(date)) ?? 0) + 1)

  // --- nutrition & balance summaries ------------------------------------------------
  const recordedDays = daily.filter((day) => day.intake_recorded)
  const foodInMonth = input.foods.filter((entry) => inMonth(entry.entry_date))
  const balanceDays = daily.filter((day) => day.estimated_balance_kcal != null)
  const monthStartWeight = weights.at(0)
  const monthEndWeight = weights.at(-1)
  const previousMonth = shiftMonth(month, -1)
  const previousStrengthSessions = input.workouts.filter((session) => isCompletedSession(session) && session.session_date.startsWith(previousMonth)).length

  return {
    schema: REPORT_SCHEMA,
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: generatedAt,
    reporting_period: {
      month,
      start_date: start,
      end_date: end,
      timezone: 'Asia/Kolkata',
      days_in_month: allDates.length,
      days_covered: dates.length,
      last_day_included: dates.length ? lastDay : null,
      is_partial: partial || isFuture,
      note: isFuture ? 'This month has not started yet; there is no data to report.' : partial ? `Month in progress: only ${dates.length} of ${allDates.length} days have happened. Future days are not treated as gaps.` : 'Complete month.',
    },
    units: { weight: 'kg', duration: 'minutes', energy: 'kcal', distance: 'km', volume: 'kg (load × reps, completed sets with a recorded load)' },
    provenance_legend: {
      recorded: 'Entered by you or captured by the app (timer, manual entry, food log, weigh-ins).',
      estimate: 'Calculated by the app from recorded values and stated assumptions. Not a measurement.',
      null: 'Not recorded / cannot be calculated. A null is never a zero.',
    },
    overview: {
      recorded: {
        training_days: activeDates.size,
        completed_strength_sessions: sessions.length,
        cardio_sessions: cardio.length,
        cardio_active_minutes: round(sum(cardio.map((session) => session.active_seconds)) / 60),
        completed_sets: monthSets.filter((set) => set.completed).length,
        weigh_ins: weights.length,
        days_with_calorie_intake_recorded: recordedDays.length,
        strength_sessions_previous_month: previousStrengthSessions,
      },
      estimate: {
        exercise_kcal: sum(daily.map((day) => day.estimated_exercise_kcal)),
        exercise_records_without_estimate: sum(daily.map((day) => day.exercise_records_without_estimate)),
      },
    },
    consistency: {
      training_days: activeDates.size,
      days_covered: dates.length,
      training_day_share_percent: dates.length ? round(activeDates.size / dates.length * 100) : null,
      longest_streak_days: streak.longest,
      streak_at_end_of_period_days: streak.current,
      training_days_per_week: [...weekly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week_start, days]) => ({ week_start, training_days: days })),
      note: 'A training day has at least one completed strength session or one cardio session.',
    },
    strength: {
      sessions: strengthRows,
      by_exercise: [...byExercise.values()].sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({
        exercise: row.name,
        completed_sets: row.sets,
        total_reps: row.reps,
        heaviest_load_kg: row.best,
        volume_kg: round(row.volume),
        sets_without_recorded_load: row.setsNoLoad,
      })),
      total_volume_kg: round(sum(strengthRows.map((row) => row.recorded.volume_kg))),
      personal_records: personalRecords,
      sessions_with_unknown_duration: sessions.filter((session) => !session.total_duration_minutes).length,
    },
    cardio: {
      sessions: cardioRows,
      totals: {
        recorded: {
          sessions: cardio.length,
          active_minutes: round(sum(cardio.map((session) => session.active_seconds)) / 60),
          distance_km: cardio.some((session) => session.distance_km != null) ? round(sum(cardio.map((session) => session.distance_km)), 2) : null,
          sessions_with_distance: cardio.filter((session) => session.distance_km != null).length,
        },
        estimate: { active_kcal: sum(cardioRows.map((row) => row.estimate.active_kcal)), sessions_without_estimate: cardioRows.filter((row) => row.estimate.active_kcal == null).length },
      },
    },
    nutrition: {
      daily: daily.map((day) => ({
        date: day.date,
        recorded: day.intake_recorded,
        intake_kcal: day.intake_kcal,
        food_log_kcal: day.intake_food_log_kcal,
        quick_add_kcal: day.intake_quick_add_kcal,
      })),
      monthly: {
        recorded: {
          total_intake_kcal_on_recorded_days: recordedDays.length ? sum(recordedDays.map((day) => day.intake_kcal)) : null,
          days_recorded: recordedDays.length,
          days_not_recorded: dates.length - recordedDays.length,
          average_intake_kcal_per_recorded_day: recordedDays.length ? Math.round(average(recordedDays.map((day) => Number(day.intake_kcal))) ?? 0) : null,
          food_log_macros_g: {
            protein: foodInMonth.some((entry) => entry.protein_g != null) ? round(sum(foodInMonth.map((entry) => entry.protein_g))) : null,
            carbs: foodInMonth.some((entry) => entry.carbs_g != null) ? round(sum(foodInMonth.map((entry) => entry.carbs_g))) : null,
            fat: foodInMonth.some((entry) => entry.fat_g != null) ? round(sum(foodInMonth.map((entry) => entry.fat_g))) : null,
            food_entries: foodInMonth.length,
            food_entries_missing_a_macro: foodInMonth.filter((entry) => entry.protein_g == null || entry.carbs_g == null || entry.fat_g == null).length,
          },
        },
        note: 'Totals cover only days with a recorded intake. A day with no entries is NOT counted as 0 kcal.',
      },
    },
    body_weight: {
      recorded: {
        entries: weights.map((entry) => ({ date: entry.entry_date, weight_kg: Number(entry.weight_kg) })),
        first_kg: monthStartWeight ? Number(monthStartWeight.weight_kg) : null,
        last_kg: monthEndWeight ? Number(monthEndWeight.weight_kg) : null,
        lowest_kg: weights.length ? Math.min(...weights.map((entry) => Number(entry.weight_kg))) : null,
        highest_kg: weights.length ? Math.max(...weights.map((entry) => Number(entry.weight_kg))) : null,
        change_first_to_last_kg: weights.length > 1 ? round(Number(monthEndWeight?.weight_kg) - Number(monthStartWeight?.weight_kg), 2) : null,
      },
      estimate: {
        trend_kg_per_week: weightTrendPerWeek(weights),
        trend_method: 'Least-squares line through this month’s weigh-ins; needs ≥ 3 weigh-ins spanning ≥ 6 days. Day-to-day water changes make short trends unreliable.',
      },
    },
    calorie_balance: {
      daily,
      monthly: {
        estimate: {
          days_with_balance: balanceDays.length,
          total_balance_kcal: balanceDays.length ? sum(balanceDays.map((day) => day.estimated_balance_kcal)) : null,
          average_balance_kcal_per_day: balanceDays.length ? Math.round(average(balanceDays.map((day) => Number(day.estimated_balance_kcal))) ?? 0) : null,
          deficit_days: balanceDays.filter((day) => Number(day.estimated_balance_kcal) > 0).length,
          surplus_days: balanceDays.filter((day) => Number(day.estimated_balance_kcal) < 0).length,
        },
        convention: 'Balance = estimated expenditure − calories consumed. Positive = deficit, negative = surplus.',
        goals_in_effect: {
          maintenance_calories: input.profile.maintenance_calorie_target ?? null,
          maintenance_includes_exercise: input.profile.maintenance_includes_exercise !== false,
          balance_target_kcal: input.profile.daily_deficit_target ?? null,
          intake_goal_kcal: input.profile.daily_calorie_target ?? null,
          exercise_goal_kcal: input.profile.daily_exercise_calorie_goal ?? null,
        },
      },
    },
    data_quality: {
      days_without_intake: daily.filter((day) => !day.intake_recorded).map((day) => day.date),
      days_without_balance: daily.filter((day) => day.estimated_balance_kcal == null).map((day) => day.date),
      has_weigh_in_this_month: weights.length > 0,
      maintenance_estimate_configured: input.profile.maintenance_calorie_target != null,
      exercise_records_without_estimate: sum(daily.map((day) => day.exercise_records_without_estimate)),
      strength_sessions_with_unknown_duration: sessions.filter((session) => !session.total_duration_minutes).length,
      assumptions: [
        ...CALORIE_METHODOLOGY_LIST,
        'Workouts are attributed to the Asia/Kolkata date on which they started, even if they finished after midnight.',
        'Discarded and unfinished workouts are excluded from every figure.',
      ],
    },
  }
}

export type MonthlyReport = ReturnType<typeof buildMonthlyReport>

const cell = (value: unknown) => (value == null ? '—' : String(value).replaceAll('|', '\\|').replaceAll('\n', ' '))
const table = (headers: string[], rows: unknown[][]) => rows.length
  ? [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)]
  : ['_None recorded._']

/** A readable Markdown rendering of the same report. “—” means not recorded (never zero). */
export function monthlyReportMarkdown(report: MonthlyReport) {
  const period = report.reporting_period
  const overview = report.overview
  const monthly = report.nutrition.monthly.recorded
  const balance = report.calorie_balance.monthly
  const weight = report.body_weight
  return [
    `# Gym Ledger monthly report — ${period.month}`,
    '',
    `Generated ${report.generated_at} · schema \`${report.schema}\` v${report.schema_version}`,
    `Period ${period.start_date} to ${period.end_date} (${period.timezone}). ${period.note}`,
    '',
    '> **How to read this.** *Recorded* values were entered or captured by you. *Estimated* values are calculated from them with the assumptions at the end. “—” means not recorded — it is never silently a zero.',
    '',
    '## Overview',
    `- Training days: **${overview.recorded.training_days}** of ${period.days_covered} days covered`,
    `- Completed strength sessions: **${overview.recorded.completed_strength_sessions}** (${overview.recorded.completed_sets} completed sets)`,
    `- Cardio: **${overview.recorded.cardio_sessions}** sessions, ${overview.recorded.cardio_active_minutes} active minutes`,
    `- Exercise calories (*estimated*): **${overview.estimate.exercise_kcal} kcal**${overview.estimate.exercise_records_without_estimate ? ` — ${overview.estimate.exercise_records_without_estimate} record(s) could not be estimated` : ''}`,
    `- Calorie intake recorded on **${monthly.days_recorded}** of ${period.days_covered} days`,
    `- Weigh-ins: ${overview.recorded.weigh_ins}`,
    '',
    '## Consistency',
    `- Training days: ${report.consistency.training_days}${report.consistency.training_day_share_percent == null ? '' : ` (${report.consistency.training_day_share_percent}% of days covered)`}`,
    `- Longest streak: ${report.consistency.longest_streak_days} days · streak at end of period: ${report.consistency.streak_at_end_of_period_days} days`,
    ...table(['Week starting', 'Training days'], report.consistency.training_days_per_week.map((week) => [week.week_start, week.training_days])),
    '',
    '## Strength training (recorded)',
    ...table(['Exercise', 'Completed sets', 'Total reps', 'Heaviest kg', 'Volume kg'], report.strength.by_exercise.map((row) => [row.exercise, row.completed_sets, row.total_reps, row.heaviest_load_kg, row.volume_kg])),
    '',
    `Total volume: **${report.strength.total_volume_kg} kg**. Volume counts completed sets that have a recorded load.`,
    '',
    '### Personal records',
    ...table(['Exercise', 'Heaviest kg', 'Reps', 'Date', 'Previous best kg', 'Result'], report.strength.personal_records.map((row) => [row.exercise, row.heaviest_load_kg, row.reps_at_that_load, row.date, row.previous_best_kg, row.is_new_personal_record ? 'New personal record' : row.first_recorded_load ? 'First recorded load' : 'No new record'])),
    '',
    '### Sessions',
    ...table(['Date', 'Session', 'Minutes', 'Sets', 'Volume kg', 'Est. active kcal'], report.strength.sessions.map((row) => [row.date, row.title, row.recorded.duration_minutes, row.recorded.completed_sets, row.recorded.volume_kg, row.estimate.active_kcal])),
    '',
    '## Cardio',
    ...table(['Date', 'Type', 'Active min', 'Distance km', 'Avg km/h', 'Incline %', 'Heart rate', 'Machine kcal (recorded)', 'Est. active kcal'], report.cardio.sessions.map((row) => [row.date, row.activity_type, row.recorded.active_minutes, row.recorded.distance_km, row.recorded.average_speed_kmh, row.recorded.incline_percent, row.recorded.heart_rate_bpm, row.recorded.machine_calories_kcal, row.estimate.active_kcal])),
    '',
    '## Calorie intake (recorded)',
    `- Recorded days: ${monthly.days_recorded} · not recorded: ${monthly.days_not_recorded}`,
    `- Total on recorded days: ${monthly.total_intake_kcal_on_recorded_days ?? '—'} kcal · average per recorded day: ${monthly.average_intake_kcal_per_recorded_day ?? '—'} kcal`,
    `- Food-log macros: protein ${monthly.food_log_macros_g.protein ?? '—'} g · carbs ${monthly.food_log_macros_g.carbs ?? '—'} g · fat ${monthly.food_log_macros_g.fat ?? '—'} g`,
    `- ${report.nutrition.monthly.note}`,
    ...table(['Date', 'Intake kcal', 'Food log', 'Quick-add'], report.nutrition.daily.map((day) => [day.date, day.intake_kcal, day.food_log_kcal, day.quick_add_kcal])),
    '',
    '## Body weight',
    ...table(['Date', 'kg'], weight.recorded.entries.map((entry) => [entry.date, entry.weight_kg])),
    '',
    `First ${weight.recorded.first_kg ?? '—'} kg · last ${weight.recorded.last_kg ?? '—'} kg · change ${weight.recorded.change_first_to_last_kg ?? '—'} kg · trend (*estimated*) ${weight.estimate.trend_kg_per_week ?? '—'} kg/week.`,
    '',
    '## Estimated daily calorie balance',
    `${balance.convention} Days with a balance: ${balance.estimate.days_with_balance} (deficit ${balance.estimate.deficit_days}, surplus ${balance.estimate.surplus_days}); average ${balance.estimate.average_balance_kcal_per_day ?? '—'} kcal/day; total ${balance.estimate.total_balance_kcal ?? '—'} kcal.`,
    ...table(['Date', 'Est. expenditure', 'Intake', 'Est. exercise', 'Balance', 'Result'], report.calorie_balance.daily.map((day) => [day.date, day.estimated_expenditure_kcal, day.intake_kcal, day.estimated_exercise_kcal, day.estimated_balance_kcal, day.estimated_balance_kind])),
    '',
    '## Data gaps and assumptions',
    `- Days without intake: ${report.data_quality.days_without_intake.length ? report.data_quality.days_without_intake.join(', ') : 'none'}`,
    `- Maintenance estimate configured: ${report.data_quality.maintenance_estimate_configured ? 'yes' : 'no — balance cannot be calculated'}`,
    `- Weigh-in this month: ${report.data_quality.has_weigh_in_this_month ? 'yes' : 'no'}`,
    `- Strength sessions with unknown duration: ${report.data_quality.strength_sessions_with_unknown_duration}`,
    ...report.data_quality.assumptions.map((note) => `- ${note}`),
    '',
  ].join('\n')
}
