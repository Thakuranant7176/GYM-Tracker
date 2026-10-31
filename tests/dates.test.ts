import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, daysInMonth, istDate, monthDates, mostRecentCompletedMonth, msUntilNextIstMidnight, shiftMonth, startOfMonth, startOfWeek, todayISO, weekday } from '../src/lib'

const utc = (iso: string) => Date.parse(iso)

test('the Asia/Kolkata day changes exactly at 00:00 IST (18:30 UTC)', () => {
  assert.equal(istDate(utc('2026-10-30T18:29:59.999Z')), '2026-10-30')
  assert.equal(istDate(utc('2026-10-30T18:30:00.000Z')), '2026-10-31')
  assert.equal(istDate(utc('2026-10-30T00:00:00.000Z')), '2026-10-30') // 05:30 IST
  assert.equal(istDate(utc('2026-12-31T18:30:00.000Z')), '2027-01-01') // year boundary
})

test('the reporting date does not depend on the browser time zone', () => {
  const instants = ['2026-10-30T18:29:59.999Z', '2026-10-30T18:30:00.000Z', '2026-03-01T00:00:00.000Z']
  const original = process.env.TZ
  try {
    const results = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Auckland'].map((zone) => {
      process.env.TZ = zone
      return instants.map((iso) => todayISO(utc(iso)))
    })
    for (const row of results) assert.deepEqual(row, ['2026-10-30', '2026-10-31', '2026-03-01'])
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

test('invalid instants give an empty date instead of throwing', () => {
  assert.equal(istDate('not a date'), '')
})

test('calendar arithmetic is exact across month, year and leap boundaries', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-10-30', 0), '2026-10-30')
  assert.equal(weekday('2026-10-30'), 5) // Friday
  assert.equal(startOfWeek('2026-10-30'), '2026-10-25') // Sunday
  assert.equal(startOfMonth('2026-10-30'), '2026-10-01')
  assert.equal(daysInMonth('2028-02'), 29)
  assert.equal(daysInMonth('2026-02'), 28)
  assert.equal(daysInMonth('2026-12'), 31)
})

test('month helpers wrap years in both directions', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-03', -14), '2025-01')
  const february = monthDates('2026-02')
  assert.equal(february.start, '2026-02-01')
  assert.equal(february.end, '2026-02-28')
  assert.equal(february.dates.length, 28)
})

test('the most recent completed month follows the IST date, not UTC', () => {
  assert.equal(mostRecentCompletedMonth(utc('2026-10-30T10:00:00Z')), '2026-09')
  // 2026-12-31 23:59:59 IST is still December -> November is the last completed month
  assert.equal(mostRecentCompletedMonth(utc('2026-12-31T18:29:59Z')), '2026-11')
  // 2027-01-01 00:00 IST -> December has just completed
  assert.equal(mostRecentCompletedMonth(utc('2026-12-31T18:30:00Z')), '2026-12')
})

test('time until the next IST midnight', () => {
  assert.equal(msUntilNextIstMidnight(utc('2026-10-30T18:29:00Z')), 60_000)
  assert.equal(msUntilNextIstMidnight(utc('2026-10-30T18:30:00Z')), 86_400_000)
  assert.equal(msUntilNextIstMidnight(utc('2026-10-30T18:29:59.999Z')), 1)
})
