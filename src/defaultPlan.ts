export interface DefaultExercise { name: string; primary: string; category?: string; sets: number; min?: number; max?: number; seconds?: number; tracking?: 'weighted' | 'bodyweight' | 'timed' | 'cardio' }
export interface DefaultDay { name: string; weekday: number; rest?: boolean; exercises: DefaultExercise[] }

export const DEFAULT_PLAN: DefaultDay[] = [
  { weekday: 1, name: 'Push A', exercises: [
    { name: 'Incline barbell bench press', primary: 'Chest', sets: 3, min: 6, max: 10 }, { name: 'Flat dumbbell press', primary: 'Chest', sets: 3, min: 8, max: 12 }, { name: 'Low-to-high cable fly', primary: 'Chest', sets: 2, min: 12, max: 15 }, { name: 'Seated dumbbell shoulder press', primary: 'Shoulders', sets: 3, min: 8, max: 12 }, { name: 'Dumbbell lateral raise', primary: 'Shoulders', sets: 3, min: 12, max: 20 }, { name: 'Cable triceps pushdown', primary: 'Triceps', sets: 3, min: 10, max: 15 }, { name: 'Overhead cable triceps extension', primary: 'Triceps', sets: 2, min: 10, max: 15 },
  ] },
  { weekday: 2, name: 'Pull A', exercises: [
    { name: 'Lat pulldown', primary: 'Back', sets: 3, min: 8, max: 12 }, { name: 'One-arm dumbbell row', primary: 'Back', sets: 3, min: 8, max: 12 }, { name: 'Seated cable row', primary: 'Back', sets: 3, min: 8, max: 12 }, { name: 'Rear-delt dumbbell fly', primary: 'Shoulders', sets: 3, min: 12, max: 20 }, { name: 'Barbell curl', primary: 'Biceps', sets: 3, min: 8, max: 12 }, { name: 'Hammer curl', primary: 'Biceps', sets: 2, min: 10, max: 15 }, { name: 'Dumbbell shrugs', primary: 'Traps', sets: 2, min: 10, max: 15 },
  ] },
  { weekday: 3, name: 'Cardio & Core', exercises: [
    { name: 'Treadmill walking or cycling', primary: 'Cardio', sets: 1, seconds: 1800, tracking: 'cardio' }, { name: 'Cable crunch', primary: 'Core', sets: 3, min: 12, max: 15 }, { name: 'Reverse crunch', primary: 'Core', sets: 3, min: 12, max: 15, tracking: 'bodyweight' }, { name: 'Side plank', primary: 'Core', sets: 3, seconds: 30, tracking: 'timed' },
  ] },
  { weekday: 4, name: 'Push B', exercises: [
    { name: 'Flat barbell bench press', primary: 'Chest', sets: 3, min: 6, max: 10 }, { name: 'Incline dumbbell press', primary: 'Chest', sets: 2, min: 8, max: 12 }, { name: 'High-to-low cable fly', primary: 'Chest', sets: 2, min: 12, max: 15 }, { name: 'Standing barbell overhead press', primary: 'Shoulders', sets: 3, min: 6, max: 10 }, { name: 'Dumbbell lateral raise', primary: 'Shoulders', sets: 3, min: 12, max: 20 }, { name: 'Close-grip bench press', primary: 'Triceps', sets: 3, min: 8, max: 12 }, { name: 'Single-dumbbell overhead triceps extension', primary: 'Triceps', sets: 2, min: 10, max: 15 },
  ] },
  { weekday: 5, name: 'Pull B', exercises: [
    { name: 'Lat pulldown — alternate grip', primary: 'Back', sets: 3, min: 8, max: 12 }, { name: 'Seated cable row', primary: 'Back', sets: 3, min: 8, max: 12 }, { name: 'Bent-over dumbbell row', primary: 'Back', sets: 3, min: 8, max: 12 }, { name: 'Dumbbell pullover', primary: 'Back', sets: 2, min: 10, max: 15 }, { name: 'Rear-delt fly', primary: 'Shoulders', sets: 2, min: 12, max: 20 }, { name: 'Incline dumbbell curl', primary: 'Biceps', sets: 3, min: 8, max: 12 }, { name: 'Preacher curl', primary: 'Biceps', sets: 2, min: 10, max: 15 },
  ] },
  { weekday: 6, name: 'Legs', exercises: [
    { name: 'Barbell squat', primary: 'Legs', sets: 3, min: 6, max: 10 }, { name: 'Romanian deadlift', primary: 'Legs', sets: 3, min: 8, max: 12 }, { name: 'Dumbbell Bulgarian split squat', primary: 'Legs', sets: 2, min: 8, max: 12 }, { name: 'Leg extension', primary: 'Legs', sets: 2, min: 12, max: 15 }, { name: 'Leg curl', primary: 'Legs', sets: 3, min: 8, max: 15 }, { name: 'Standing calf raise', primary: 'Legs', sets: 4, min: 12, max: 20 },
  ] },
  { weekday: 0, name: 'Rest', rest: true, exercises: [] },
]

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Triceps', 'Biceps', 'Legs', 'Core', 'Traps', 'Cardio', 'Full body']
