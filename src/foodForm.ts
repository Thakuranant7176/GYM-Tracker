import { parseDecimal } from './numbers'

// Limits mirror the food_entries table (calories 0–20,000; name 1–200 characters; macros >= 0).
export const FOOD_LIMITS = { maxCalories: 20000, maxMacroGrams: 9999, maxNameLength: 200 } as const

export type FoodFormInput = { name: string; calories: string; protein_g: string; carbs_g: string; fat_g: string }

export type FoodCheck =
  | { ok: true; name: string; calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
  | { ok: false; error: string }

/** Validates a food entry before it is sent. Blank macros are "not entered" (null), never 0. */
export function validateFoodForm(input: FoodFormInput): FoodCheck {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Enter a food or meal name.' }
  if (name.length > FOOD_LIMITS.maxNameLength) return { ok: false, error: `Keep the name under ${FOOD_LIMITS.maxNameLength} characters.` }
  const calories = parseDecimal(input.calories)
  if (calories.blank || calories.value == null || !Number.isInteger(calories.value) || calories.value > FOOD_LIMITS.maxCalories) {
    return { ok: false, error: `Calories must be a whole number from 0 to ${FOOD_LIMITS.maxCalories.toLocaleString('en-IN')}.` }
  }
  const macros: Array<number | null> = []
  for (const text of [input.protein_g, input.carbs_g, input.fat_g]) {
    const parsed = parseDecimal(text)
    if (parsed.blank) {
      macros.push(null)
    } else if (parsed.value == null || parsed.value > FOOD_LIMITS.maxMacroGrams) {
      return { ok: false, error: `Protein, carbs and fat must be between 0 and ${FOOD_LIMITS.maxMacroGrams.toLocaleString('en-IN')} g, or left empty.` }
    } else {
      macros.push(parsed.value)
    }
  }
  return { ok: true, name, calories: calories.value, protein_g: macros[0], carbs_g: macros[1], fat_g: macros[2] }
}
