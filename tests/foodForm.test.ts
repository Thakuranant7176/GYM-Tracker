import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFoodForm, type FoodFormInput } from '../src/foodForm'

const input = (patch: Partial<FoodFormInput> = {}): FoodFormInput => ({ name: 'Dal rice', calories: '450', protein_g: '', carbs_g: '', fat_g: '', ...patch })
const ok = (patch?: Partial<FoodFormInput>) => {
  const result = validateFoodForm(input(patch))
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.ok ? result : (undefined as never)
}
const bad = (patch: Partial<FoodFormInput>) => {
  const result = validateFoodForm(input(patch))
  assert.equal(result.ok, false, `expected ${JSON.stringify(patch)} to be rejected`)
  return result.ok ? '' : result.error
}

test('a meal needs only a name and whole calories; macros stay "not entered" (null), never 0', () => {
  const result = ok()
  assert.deepEqual([result.name, result.calories, result.protein_g, result.carbs_g, result.fat_g], ['Dal rice', 450, null, null, null])
})

test('macros accept decimals, and an explicit 0 is kept as 0', () => {
  const result = ok({ protein_g: '12.5', carbs_g: '0', fat_g: '8,5' })
  assert.deepEqual([result.protein_g, result.carbs_g, result.fat_g], [12.5, 0, 8.5])
})

test('the name is trimmed and required', () => {
  assert.equal(ok({ name: '  Paneer  ' }).name, 'Paneer')
  bad({ name: '' })
  bad({ name: '   ' })
  bad({ name: 'x'.repeat(201) })
  assert.equal(ok({ name: 'x'.repeat(200) }).name.length, 200)
})

test('calories: a whole number from 0 to 20,000 (the database limits)', () => {
  assert.equal(ok({ calories: '0' }).calories, 0)
  assert.equal(ok({ calories: '20000' }).calories, 20000)
  assert.equal(ok({ calories: '350.0' }).calories, 350)
  for (const calories of ['', ' ', '12.5', '-5', '20001', 'abc', '1e3', '1,000']) bad({ calories })
})

test('macros: 0 to 9,999 g or empty', () => {
  for (const protein_g of ['-1', 'abc', '10000', '1e2']) assert.match(bad({ protein_g }), /Protein, carbs and fat/)
  assert.match(bad({ carbs_g: '-0.5' }), /Protein, carbs and fat/)
  assert.match(bad({ fat_g: '99999' }), /Protein, carbs and fat/)
  assert.equal(ok({ fat_g: '9999' }).fat_g, 9999)
})

test('the error explains what to fix', () => {
  assert.match(bad({ name: '' }), /name/i)
  assert.match(bad({ calories: '12.5' }), /whole number/)
})
