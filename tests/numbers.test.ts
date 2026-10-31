import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDecimal } from '../src/numbers'

test('blank fields are blank, not zero', () => {
  assert.deepEqual(parseDecimal(''), { blank: true })
  assert.deepEqual(parseDecimal('   '), { blank: true })
})

test('plain and decimal numbers', () => {
  const cases: Array<[string, number]> = [['5', 5], ['0', 0], ['5.5', 5.5], ['.5', 0.5], ['5.', 5], [' 72.4 ', 72.4], ['007', 7]]
  for (const [text, value] of cases) assert.deepEqual(parseDecimal(text), { blank: false, value }, text)
})

test('a decimal comma has one or two digits', () => {
  assert.deepEqual(parseDecimal('6,5'), { blank: false, value: 6.5 })
  assert.deepEqual(parseDecimal('2,25'), { blank: false, value: 2.25 })
})

test('ambiguous or malformed input is rejected instead of guessed', () => {
  for (const text of ['1,000', '12,345', '1e3', '-1', '+1', '1 000', 'abc', '1.2.3', '.', ',5', '5,5,5', '5,', '1,0000', '0x10', 'NaN', 'Infinity']) {
    assert.deepEqual(parseDecimal(text), { blank: false, value: null }, text)
  }
})
