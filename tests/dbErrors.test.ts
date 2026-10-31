import test from 'node:test'
import assert from 'node:assert/strict'
import { describeDbError, isMissingSchemaError, isUniqueViolation, MIGRATIONS } from '../src/dbErrors'

test('errors that mean "this migration has not been applied" are recognised', () => {
  const missing = [
    { message: 'x', code: '42P01' },
    { message: 'x', code: '42703' },
    { message: 'x', code: '42883' },
    { message: 'x', code: 'PGRST202' },
    { message: 'x', code: 'PGRST204' },
    { message: 'x', code: 'PGRST205' },
    { message: 'Could not find the function public.start_workout(p_session_date, p_title, p_workout_plan_id) in the schema cache' },
    { message: "Could not find the table 'public.calorie_intake_entries' in the schema cache" },
    { message: 'relation "calorie_intake_entries" does not exist' },
    { message: 'column "status" does not exist' },
  ]
  for (const error of missing) assert.equal(isMissingSchemaError(error), true, error.message)
})

test('ordinary errors are not mistaken for a missing migration', () => {
  const ordinary = [
    { message: 'JWT expired', code: 'PGRST301' },
    { message: 'new row violates check constraint "calorie_intake_entries_calories_check"', code: '23514' },
    { message: 'Workout session not found' },
    { message: 'This workout was discarded and can no longer be completed.' },
    { message: 'duplicate key value violates unique constraint', code: '23505' },
  ]
  for (const error of ordinary) assert.equal(isMissingSchemaError(error), false, error.message)
  assert.equal(isMissingSchemaError(null), false)
  assert.equal(isMissingSchemaError(undefined), false)
})

test('a missing migration is explained with the file to run; other errors pass through unchanged', () => {
  const missing = describeDbError({ message: 'x', code: 'PGRST202' }, MIGRATIONS.lifecycle)
  assert.ok(missing.includes('20261029_workout_lifecycle.sql'))
  assert.ok(missing.includes('SQL editor'))
  assert.equal(describeDbError({ message: 'Workout session not found' }, MIGRATIONS.lifecycle), 'Workout session not found')
  assert.equal(describeDbError({ message: 'x', code: 'PGRST202' }), 'x') // no migration named: nothing to suggest
})

test('a duplicate-key error is recognised by code or message', () => {
  assert.equal(isUniqueViolation({ message: 'x', code: '23505' }), true)
  assert.equal(isUniqueViolation({ message: 'duplicate key value violates unique constraint "weight_entries_user_id_entry_date_key"' }), true)
  assert.equal(isUniqueViolation({ message: 'something else', code: '23514' }), false)
  assert.equal(isUniqueViolation(null), false)
})
