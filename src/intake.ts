import { newId } from './lib'

export type IntakeMode = 'add' | 'set'
export const MAX_DAILY_KCAL = 20000

export type IntakeCheck = { ok: true; value: number } | { ok: false; error: string }

/**
 * Validates a manual calorie entry before it is sent.
 *  - add: whole kcal 1–20,000, and the day's total after adding must stay ≤ 20,000.
 *  - set: whole kcal 0–20,000 (0 records an explicit "ate nothing"), and not below what the
 *    detailed food log already totals, because the food log is never changed by a "set".
 */
export function validateIntake(mode: IntakeMode, text: string, context: { foodCalories: number; currentTotal: number | null }): IntakeCheck {
  const trimmed = text.trim()
  const value = trimmed === '' ? Number.NaN : Number(trimmed)
  const lowest = mode === 'add' ? 1 : 0
  if (!Number.isInteger(value) || value < lowest || value > MAX_DAILY_KCAL) {
    return { ok: false, error: mode === 'add' ? 'Enter whole calories between 1 and 20,000.' : 'Enter a whole daily total between 0 and 20,000.' }
  }
  if (mode === 'add' && (context.currentTotal ?? 0) + value > MAX_DAILY_KCAL) {
    return { ok: false, error: 'A day’s total cannot exceed 20,000 kcal.' }
  }
  if (mode === 'set' && value < context.foodCalories) {
    return { ok: false, error: `Your food log already totals ${context.foodCalories.toLocaleString('en-IN')} kcal for today. Enter at least that, or edit the food log.` }
  }
  return { ok: true, value }
}

/**
 * Holds the idempotency key for the submission currently being edited.
 * `current()` returns the same id for every retry of the same content, so the database can
 * ignore a repeat; `reset()` is called when the content changes or the save succeeds, so the
 * next, different submission gets a fresh id.
 */
export function createSubmissionTracker(makeId: () => string = newId) {
  let id: string | null = null
  return {
    current: () => (id ??= makeId()),
    reset: () => {
      id = null
    },
  }
}

/**
 * Like the submission tracker, for forms whose fields are not all wired to a reset: the id is tied to a
 * fingerprint of the content being saved. Saving the same content again (a retry, a double tap) reuses the
 * id, so the database can ignore the repeat; different content gets a new id; `reset()` after success.
 */
export function createContentTracker(makeId: () => string = newId) {
  let last: { fingerprint: string; id: string } | null = null
  return {
    idFor: (fingerprint: string) => {
      if (!last || last.fingerprint !== fingerprint) last = { fingerprint, id: makeId() }
      return last.id
    },
    reset: () => {
      last = null
    },
  }
}
