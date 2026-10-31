import type { CalorieIntakeEntry, CardioSession, Exercise, FoodEntry, Profile, WeightEntry, WorkoutPlan, WorkoutSession, WorkoutSet } from '../src/types'

export const USER = '00000000-0000-4000-8000-000000000001'
export const OTHER = '00000000-0000-4000-8000-000000000002'

let counter = 0
const nextId = (prefix: string) => `${prefix}-${++counter}`

export const profile = (patch: Partial<Profile> = {}): Profile => ({
  id: USER,
  setup_completed: true,
  display_name: 'Test',
  timezone: 'Asia/Kolkata',
  unit_system: 'metric',
  starting_weight_kg: 70,
  target_weight_kg: null,
  goal_date: null,
  daily_calorie_target: 2200,
  daily_exercise_calorie_goal: 500,
  maintenance_calorie_target: 2500,
  daily_deficit_target: 500,
  maintenance_includes_exercise: true,
  protein_target_g: null,
  carb_target_g: null,
  fat_target_g: null,
  weekly_cardio_goal_minutes: null,
  activity_scoring: { strength_complete_points: 40, set_points: 5, cardio_minute_points: 1, low_threshold: 10, moderate_threshold: 30, high_threshold: 55, very_high_threshold: 80 },
  active_gym_id: null,
  ...patch,
})

export const weight = (entry_date: string, weight_kg: number, patch: Partial<WeightEntry> = {}): WeightEntry => ({ id: nextId('w'), entry_date, weight_kg, notes: null, ...patch })
export const food = (entry_date: string, calories: number, patch: Partial<FoodEntry> = {}): FoodEntry => ({ id: nextId('f'), entry_date, name: 'Meal', meal_type: 'lunch', calories, protein_g: null, carbs_g: null, fat_g: null, notes: null, ...patch })
export const quick = (entry_date: string, calories: number, patch: Partial<CalorieIntakeEntry> = {}): CalorieIntakeEntry => ({ id: nextId('q'), entry_date, calories, note: null, source: 'add', created_at: `${entry_date}T06:00:00Z`, ...patch })
export const cardio = (patch: Partial<CardioSession> & { session_date: string }): CardioSession => ({
  id: nextId('c'),
  activity_type: 'treadmill',
  started_at: null,
  active_seconds: 1800,
  paused_seconds: 0,
  distance_km: null,
  average_speed_kmh: null,
  incline_percent: null,
  heart_rate_bpm: null,
  machine_calories: null,
  notes: null,
  ...patch,
})
export const workout = (patch: Partial<WorkoutSession> & { session_date: string }): WorkoutSession => ({
  id: nextId('s'),
  workout_plan_id: null,
  title: 'Push',
  status: 'completed',
  completed: patch.status ? patch.status === 'completed' : true,
  notes: null,
  total_duration_minutes: 60,
  started_at: null,
  completed_at: null,
  created_at: `${patch.session_date}T04:00:00Z`,
  ...patch,
})
export const set = (workout_session_id: string, patch: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: nextId('set'),
  workout_session_id,
  exercise_id: null,
  set_number: 1,
  reps: 8,
  weight_kg: 50,
  duration_seconds: null,
  side: null,
  completed: true,
  notes: null,
  ...patch,
})
export const exercise = (id: string, name: string): Exercise => ({ id, name, primary_muscle: 'Chest', secondary_muscles: [], equipment_id: null, category: 'compound', tracking_type: 'weighted', instructions: null, default_sets: 3, default_rep_min: 8, default_rep_max: 12, archived: false })
export const plan = (patch: Partial<WorkoutPlan> & { id: string; weekday: number }): WorkoutPlan => ({ name: 'Push', is_rest_day: false, notes: null, archived: false, ...patch })
