import { calculateDailyCalories, CALORIE_METHODOLOGY, estimateCardioActiveCalories, estimateStrengthActiveCalories, monthDates, weightForDate } from './calories'
import { addDays, formatDate } from './lib'
import type { CardioSession, DailyCalorieTotal, Exercise, FoodEntry, Profile, WeightEntry, WorkoutSession, WorkoutSet } from './types'

export type MonthlyReportInput = {
  profile: Profile
  weights: WeightEntry[]
  foods: FoodEntry[]
  manualTotals: DailyCalorieTotal[]
  cardio: CardioSession[]
  workouts: WorkoutSession[]
  sets: WorkoutSet[]
  exercises: Exercise[]
}

const total = (values: Array<number | null | undefined>) => values.reduce((sum, value) => sum + Number(value ?? 0), 0)
const completed = (session: WorkoutSession) => session.status === 'completed' || session.completed

function longestStreak(dates: string[]) {
  const active = new Set(dates)
  let longest = 0
  let current = 0
  for (const date of [...active].sort()) {
    const yesterday = addDays(date, -1)
    current = active.has(yesterday) ? current + 1 : 1
    longest = Math.max(longest, current)
  }
  return longest
}

function weeklyWeightAverages(entries: WeightEntry[]) {
  const buckets = new Map<string, number[]>()
  for (const entry of entries) {
    const day = new Date(`${entry.entry_date}T12:00:00+05:30`)
    const weekStart = addDays(entry.entry_date, -day.getDay())
    buckets.set(weekStart, [...(buckets.get(weekStart) ?? []), Number(entry.weight_kg)])
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week_start, values]) => ({
    week_start,
    average_kg: Number((total(values) / values.length).toFixed(2)),
    measurements: values.length,
  }))
}

export function buildMonthlyReport(input: MonthlyReportInput, month: string) {
  const { start, end, dates } = monthDates(month)
  const previous = monthDates(addDays(start, -1).slice(0, 7))
  const sessions = input.workouts.filter((session) => completed(session) && session.session_date >= start && session.session_date <= end)
  const sessionIds = new Set(sessions.map((session) => session.id))
  const workoutSets = input.sets.filter((set) => sessionIds.has(set.workout_session_id))
  const cardio = input.cardio.filter((session) => session.session_date >= start && session.session_date <= end)
  const weights = input.weights.filter((entry) => entry.entry_date >= start && entry.entry_date <= end).sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const daily = dates.map((date) => {
    const calories = calculateDailyCalories({ date, profile: input.profile, weights: input.weights, foods: input.foods, manualTotals: input.manualTotals, cardio: input.cardio, workouts: input.workouts })
    const foodEntries = input.foods.filter((entry) => entry.entry_date === date)
    return {
      date,
      intake_kcal: calories.intakeCalories,
      intake_source: calories.manualTotal ? 'manual_daily_total' : foodEntries.length ? 'food_entries' : 'missing',
      food_entry_calories_kcal: calories.foodCalories,
      estimated_expenditure_kcal: calories.estimatedExpenditure,
      estimated_deficit_or_surplus_kcal: calories.estimatedBalance,
      exercise_calories_kcal: calories.exerciseCalories,
      missing_exercise_estimates: calories.unavailableExerciseRecords,
    }
  })
  const cardioReport = cardio.map((session) => {
    const estimate = estimateCardioActiveCalories(session, weightForDate(session.session_date, input.weights, input.profile))
    return {
      date: session.session_date,
      activity_type: session.activity_type,
      active_minutes: Number((session.active_seconds / 60).toFixed(1)),
      distance_km: session.distance_km,
      average_speed_kmh: session.average_speed_kmh,
      incline_percent: session.incline_percent,
      machine_calories_kcal: session.machine_calories,
      estimated_active_calories_kcal: estimate.calories,
      estimation_method: estimate.method,
    }
  })
  const strengthReport = sessions.map((session) => {
    const estimate = estimateStrengthActiveCalories(session, weightForDate(session.session_date, input.weights, input.profile))
    const lines = workoutSets.filter((set) => set.workout_session_id === session.id).map((set) => ({
      exercise: input.exercises.find((exercise) => exercise.id === set.exercise_id)?.name ?? 'Archived exercise',
      set_number: set.set_number,
      repetitions: set.reps,
      load_kg: set.weight_kg,
      duration_seconds: set.duration_seconds,
      completed: set.completed,
    }))
    return {
      date: session.session_date,
      title: session.title,
      duration_minutes: session.total_duration_minutes,
      completed_sets: lines.filter((line) => line.completed).length,
      volume_kg: total(lines.filter((line) => line.completed).map((line) => Number(line.load_kg ?? 0) * Number(line.repetitions ?? 0))),
      estimated_active_calories_kcal: estimate.calories,
      estimation_method: estimate.method,
      sets: lines,
    }
  })
  const activeDates = [...new Set([...sessions.map((session) => session.session_date), ...cardio.map((session) => session.session_date)])]
  const recordedNutritionDays = daily.filter((day) => day.intake_kcal != null)
  const currentVolume = total(strengthReport.map((session) => session.volume_kg))
  const previousSessions = input.workouts.filter((session) => completed(session) && session.session_date >= previous.start && session.session_date <= previous.end)
  const previousIds = new Set(previousSessions.map((session) => session.id))
  const previousVolume = total(input.sets.filter((set) => previousIds.has(set.workout_session_id) && set.completed).map((set) => Number(set.weight_kg ?? 0) * Number(set.reps ?? 0)))
  const macros = input.foods.filter((entry) => entry.entry_date >= start && entry.entry_date <= end).reduce((sum, entry) => ({
    protein_g: sum.protein_g + Number(entry.protein_g ?? 0),
    carbs_g: sum.carbs_g + Number(entry.carbs_g ?? 0),
    fat_g: sum.fat_g + Number(entry.fat_g ?? 0),
  }), { protein_g: 0, carbs_g: 0, fat_g: 0 })

  return {
    schema_version: 'gym-ledger-monthly-report/v1',
    generated_at: new Date().toISOString(),
    reporting_period: { month, start_date: start, end_date: end, timezone: 'Asia/Kolkata' },
    units: { weight: 'kg', duration: 'minutes', energy: 'kcal', distance: 'km', volume: 'kg' },
    methodology: {
      calorie_estimates: CALORIE_METHODOLOGY,
      manual_intake: 'A saved manual daily total supersedes that date’s detailed food-entry sum to avoid double-counting. A missing intake value is not treated as zero.',
      balance: 'Estimated balance = configured maintenance calories plus recorded exercise when maintenance excludes deliberate exercise, minus recorded intake.',
    },
    overview: {
      training_days: activeDates.length,
      longest_activity_streak_days: longestStreak(activeDates),
      strength_sessions: sessions.length,
      cardio_sessions: cardio.length,
      total_cardio_minutes: Number((total(cardio.map((session) => session.active_seconds)) / 60).toFixed(1)),
      completed_sets: workoutSets.filter((set) => set.completed).length,
      estimated_exercise_calories_kcal: total(daily.map((day) => day.exercise_calories_kcal)),
      total_recorded_calorie_intake_kcal: total(recordedNutritionDays.map((day) => day.intake_kcal)),
      average_daily_recorded_calorie_intake_kcal: recordedNutritionDays.length ? Math.round(total(recordedNutritionDays.map((day) => day.intake_kcal)) / recordedNutritionDays.length) : null,
      weight_measurements: weights.length,
    },
    strength_training: {
      sessions: strengthReport,
      monthly_volume_kg: currentVolume,
      comparison_with_previous_month: previousSessions.length ? {
        strength_sessions_change: sessions.length - previousSessions.length,
        volume_kg_change: currentVolume - previousVolume,
      } : null,
    },
    cardio: {
      sessions: cardioReport,
      total_estimated_active_calories_kcal: total(cardioReport.map((session) => session.estimated_active_calories_kcal)),
    },
    nutrition: {
      daily: daily.filter((day) => day.intake_kcal != null).map((day) => ({
        date: day.date,
        calorie_intake_kcal: day.intake_kcal,
        source: day.intake_source,
      })),
      macronutrients_from_detailed_food_entries: macros,
      missing_dates: daily.filter((day) => day.intake_kcal == null).map((day) => day.date),
    },
    body_weight: {
      measurements: weights.map((entry) => ({ date: entry.entry_date, weight_kg: entry.weight_kg })),
      starting_kg: weights.at(0)?.weight_kg ?? null,
      ending_kg: weights.at(-1)?.weight_kg ?? null,
      change_kg: weights.length > 1 ? Number((Number(weights.at(-1)?.weight_kg) - Number(weights.at(0)?.weight_kg)).toFixed(2)) : null,
      weekly_averages: weeklyWeightAverages(weights),
    },
    daily_calorie_balance: daily,
    data_quality_and_limitations: {
      missing_intake_dates: daily.filter((day) => day.intake_kcal == null).map((day) => day.date),
      sessions_without_exercise_estimates: daily.reduce((sum, day) => sum + day.missing_exercise_estimates, 0),
      maintenance_calorie_target_configured: Boolean(input.profile.maintenance_calorie_target),
      notes: [
        'No zero intake, body weight, or activity value is fabricated for missing records.',
        'Calorie estimates are not a clinical measurement and should not be used to promise a specific rate of weight change.',
      ],
    },
  }
}

export function monthlyReportMarkdown(report: ReturnType<typeof buildMonthlyReport>) {
  const overview = report.overview
  const balance = report.daily_calorie_balance.filter((day) => day.estimated_deficit_or_surplus_kcal != null)
  return [
    `# Gym Ledger monthly report — ${report.reporting_period.month}`,
    '',
    `Generated: ${report.generated_at}`,
    `Period: ${formatDate(report.reporting_period.start_date)} to ${formatDate(report.reporting_period.end_date)} (${report.reporting_period.timezone})`,
    '',
    '## Overview',
    `- Training days: ${overview.training_days}`,
    `- Strength sessions: ${overview.strength_sessions}`,
    `- Cardio sessions: ${overview.cardio_sessions} (${overview.total_cardio_minutes} minutes)`,
    `- Completed sets: ${overview.completed_sets}`,
    `- Estimated exercise calories: ${overview.estimated_exercise_calories_kcal} kcal`,
    `- Recorded calorie intake: ${overview.total_recorded_calorie_intake_kcal} kcal`,
    `- Average intake on recorded days: ${overview.average_daily_recorded_calorie_intake_kcal ?? 'unavailable'} kcal`,
    '',
    '## Strength training',
    ...report.strength_training.sessions.map((session) => `- ${session.date}: ${session.title} — ${session.completed_sets} completed sets, ${session.volume_kg} kg volume${session.estimated_active_calories_kcal == null ? '' : `, ~${session.estimated_active_calories_kcal} kcal active estimate`}`),
    '',
    '## Cardio',
    ...report.cardio.sessions.map((session) => `- ${session.date}: ${session.activity_type}, ${session.active_minutes} minutes${session.estimated_active_calories_kcal == null ? '' : `, ~${session.estimated_active_calories_kcal} kcal active estimate`}`),
    '',
    '## Nutrition',
    `- Recorded intake days: ${report.nutrition.daily.length}`,
    `- Missing intake days: ${report.nutrition.missing_dates.length}`,
    `- Detailed food-entry macros: ${Math.round(report.nutrition.macronutrients_from_detailed_food_entries.protein_g)} g protein, ${Math.round(report.nutrition.macronutrients_from_detailed_food_entries.carbs_g)} g carbs, ${Math.round(report.nutrition.macronutrients_from_detailed_food_entries.fat_g)} g fat`,
    '',
    '## Body weight',
    `- Measurements: ${report.body_weight.measurements.length}`,
    `- Start / end / change: ${report.body_weight.starting_kg ?? 'unavailable'} kg / ${report.body_weight.ending_kg ?? 'unavailable'} kg / ${report.body_weight.change_kg ?? 'unavailable'} kg`,
    '',
    '## Daily calorie balance',
    `- Days with an estimated balance: ${balance.length}`,
    ...balance.map((day) => `- ${day.date}: intake ${day.intake_kcal} kcal, expenditure ${day.estimated_expenditure_kcal} kcal, ${Number(day.estimated_deficit_or_surplus_kcal) >= 0 ? 'estimated deficit' : 'estimated surplus'} ${Math.abs(Number(day.estimated_deficit_or_surplus_kcal))} kcal`),
    '',
    '## Data quality and limitations',
    ...report.data_quality_and_limitations.notes.map((note) => `- ${note}`),
    `- ${report.methodology.calorie_estimates}`,
  ].join('\n')
}
