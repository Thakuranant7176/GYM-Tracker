export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type ActivityType = 'treadmill' | 'cycling' | 'walking' | 'other'

export interface Profile {
  id: string
  setup_completed: boolean
  display_name: string | null
  timezone: string
  unit_system: 'metric' | 'imperial'
  starting_weight_kg: number | null
  target_weight_kg: number | null
  goal_date: string | null
  daily_calorie_target: number | null
  protein_target_g: number | null
  carb_target_g: number | null
  fat_target_g: number | null
  weekly_cardio_goal_minutes: number | null
  activity_scoring: ActivityScoring
  active_gym_id: string | null
}

export interface ActivityScoring {
  strength_complete_points: number
  set_points: number
  cardio_minute_points: number
  low_threshold: number
  moderate_threshold: number
  high_threshold: number
  very_high_threshold: number
}

export interface WeightEntry { id: string; entry_date: string; weight_kg: number; notes: string | null; created_at?: string }
export interface FoodEntry { id: string; entry_date: string; name: string; meal_type: MealType; calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null; notes: string | null; created_at?: string }
export interface CardioSession { id: string; activity_type: ActivityType; session_date: string; started_at: string | null; active_seconds: number; paused_seconds: number | null; distance_km: number | null; average_speed_kmh: number | null; incline_percent: number | null; heart_rate_bpm: number | null; machine_calories: number | null; notes: string | null; created_at?: string }
export interface Gym { id: string; name: string; location: string | null; notes: string | null; archived: boolean }
export interface Equipment { id: string; gym_id: string | null; name: string; category: string; manufacturer: string | null; model: string | null; settings: string | null; notes: string | null; archived: boolean }
export interface Exercise { id: string; name: string; primary_muscle: string; secondary_muscles: string[]; equipment_id: string | null; category: string; tracking_type: 'weighted' | 'bodyweight' | 'timed' | 'distance' | 'cardio'; instructions: string | null; default_sets: number | null; default_rep_min: number | null; default_rep_max: number | null; archived: boolean }
export interface WorkoutPlan { id: string; name: string; weekday: number; is_rest_day: boolean; notes: string | null; archived: boolean }
export interface PlanExercise { id: string; workout_plan_id: string; exercise_id: string | null; position: number; planned_sets: number; rep_min: number | null; rep_max: number | null; target_seconds: number | null; notes: string | null; exercise?: Exercise }
export interface WorkoutSession { id: string; workout_plan_id: string | null; session_date: string; title: string; completed: boolean; notes: string | null; total_duration_minutes: number | null; created_at?: string }
export interface WorkoutSet { id: string; workout_session_id: string; exercise_id: string | null; set_number: number; reps: number | null; weight_kg: number | null; duration_seconds: number | null; side: string | null; completed: boolean; notes: string | null; exercise?: Exercise }

export interface TimerState {
  activityType: ActivityType
  sessionDate: string
  status: 'running' | 'paused'
  accumulatedSeconds: number
  pausedSeconds: number
  startedAt: string | null
  createdAt: string
}
