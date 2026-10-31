type DbError = { message: string; code?: string | null } | null | undefined

/** PostgREST / Postgres signals that a table, column or function the app expects is not there. */
const MISSING_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])
const MISSING_PATTERN = /schema cache|could not find the (function|table|column)|does not exist/i

export const isMissingSchemaError = (error: DbError) =>
  Boolean(error && ((error.code && MISSING_CODES.has(error.code)) || MISSING_PATTERN.test(error.message)))

export const MIGRATIONS = {
  lifecycle: 'supabase/migrations/20261029_workout_lifecycle.sql',
  calories: 'supabase/migrations/20261029_calorie_tracking.sql',
} as const

/**
 * The text to show for a failed database call. When the cause is an unapplied migration the
 * message names the file to run, instead of surfacing a raw "schema cache" error.
 */
export function describeDbError(error: NonNullable<DbError>, migration?: string) {
  if (migration && isMissingSchemaError(error)) {
    return `Your database has not been updated for this feature yet. Run ${migration} in the Supabase SQL editor, then reload.`
  }
  return error.message
}

/** Postgres unique_violation (e.g. a second weight entry for the same date). */
export const isUniqueViolation = (error: DbError) => Boolean(error && (error.code === '23505' || /duplicate key value/i.test(error.message)))
