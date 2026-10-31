import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToString } from 'react-dom/server'
import { CardioPage, Dashboard, DateDetail, NutritionPage, ProgressPage, WorkoutPage } from '../src/App'
import { CalorieDashboard } from '../src/CalorieDashboard'
import { addDays, todayISO, weekday } from '../src/lib'
import { appData, cardio, food, profile, quick, set, workout } from './fixtures'

// These tests server-render the real screens with fixture data. They cannot click or measure layout,
// but they do catch render-time crashes (bad props, undefined access, hook misuse) and check what the
// user would actually read on each screen.

const TODAY = todayISO()
const YESTERDAY = addDays(TODAY, -1)
const noop = async () => {}
const quiet = () => {}

/** Visible text only: tags and React's text-splitting comments removed, entities decoded. */
const plain = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

/** Runs `run` with a fake browser localStorage holding `value` for every key. */
function withStorage<T>(value: string | null, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => value, setItem: () => {}, removeItem: () => {} }, configurable: true, writable: true })
  try {
    return run()
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

const cardioPage = (data = appData(), initialDate: string | null = null) =>
  renderToString(<CardioPage data={data} today={TODAY} refresh={noop} inform={quiet} initialDate={initialDate} />)

// ============================ Cardio: the three options ======================================
test('cardio offers exactly three activities: cycling, treadmill, walking', () => {
  const html = cardioPage()
  assert.equal((html.match(/role="radio"/g) ?? []).length, 3)
  const text = plain(html)
  for (const label of ['Cycling', 'Treadmill', 'Walking']) assert.ok(text.includes(label), label)
  assert.ok(text.includes('What did you do?'))
  assert.ok(!text.includes('Other cardio'), 'no fourth option is offered for new sessions')
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1, 'exactly one option is selected')
})

test('treadmill (the default) asks for speed, incline and time, and offers the live timer', () => {
  const text = plain(cardioPage())
  assert.ok(text.includes('Speed (km/h) required'))
  assert.ok(text.includes('Incline (%) required — 0 for flat'))
  assert.ok(text.includes('Time (minutes) required'))
  assert.ok(text.includes('Use the live timer instead'))
  assert.ok(!text.includes('Distance (km)'), 'distance is not asked for on the treadmill')
})

test('required cardio fields are announced as required to assistive technology', () => {
  const html = cardioPage()
  assert.equal((html.match(/aria-required="true"/g) ?? []).length, 3, 'speed, incline and time on the treadmill')
  const walking = cardioPage(appData({ cardio: [cardio({ session_date: YESTERDAY, activity_type: 'walking' })] }))
  assert.equal((walking.match(/aria-required="true"/g) ?? []).length, 1, 'only the time for walking')
})

test('cycling and walking ask for time, with distance optional and no speed or incline', () => {
  for (const kind of ['cycling', 'walking'] as const) {
    const data = appData({ cardio: [cardio({ session_date: YESTERDAY, activity_type: kind })] }) // the last-used option is preselected
    const text = plain(cardioPage(data))
    assert.ok(text.includes('Time (minutes) required'), kind)
    assert.ok(text.includes('Distance (km) optional'), kind)
    assert.ok(!text.includes('Speed (km/h)'), kind)
    assert.ok(!text.includes('Incline (%)'), kind)
  }
})

test('history shows what was recorded plus a labelled calorie estimate', () => {
  const data = appData({
    cardio: [
      cardio({ id: 'a', session_date: YESTERDAY, activity_type: 'treadmill', active_seconds: 1800, average_speed_kmh: 6, incline_percent: 10 }),
      cardio({ id: 'b', session_date: addDays(TODAY, -2), activity_type: 'walking', active_seconds: 1800 }),
      cardio({ id: 'c', session_date: addDays(TODAY, -3), activity_type: 'other', active_seconds: 1200 }),
    ],
  })
  const text = plain(cardioPage(data))
  assert.ok(text.includes('Treadmill · 30m 00s'))
  assert.ok(text.includes('6 km/h · 10% incline'))
  assert.ok(text.includes('≈ 298 kcal burned (estimate)')) // 28 ml/kg/min net x 71 kg x 30 min
  assert.ok(text.includes('Walking · 30m 00s'))
  assert.ok(text.includes('≈ 93 kcal burned (estimate)')) // 3.5 MET time-only
  assert.ok(text.includes('Other cardio · 20m 00s'), 'older records keep their label')
  assert.ok(text.includes('No calorie estimate'), 'an unestimable record says so instead of showing a made-up number')
})

test('a running timer locks the activity, shows the elapsed time and restores typed details', () => {
  const stored = JSON.stringify({ activityType: 'treadmill', sessionDate: TODAY, status: 'paused', accumulatedSeconds: 600, pausedSeconds: 0, startedAt: null, createdAt: `${TODAY}T04:00:00Z`, sessionId: 'timer-1', details: { speed: '6.5', incline: '3', distance: '', notes: 'hills' } })
  const data = appData({ cardio: [cardio({ session_date: YESTERDAY })] })
  const html = withStorage(stored, () => cardioPage(data))
  const text = plain(html)
  assert.ok(text.includes('Live timer'))
  assert.ok(text.includes('10m 00s'))
  assert.ok(text.includes('Resume'))
  assert.ok(text.includes('Finish & save'))
  assert.ok(text.includes('The activity is locked while the timer is running.'))
  assert.ok(!text.includes('Time (minutes)'), 'the minutes field is replaced by the timer')
  assert.ok(!text.includes('Use the live timer instead'))
  assert.ok(html.includes('value="6.5"') && html.includes('value="3"'), 'speed and incline typed during the timer survive a refresh')
  assert.ok(html.includes('hills'))
  // the two non-selected options and the edit buttons are disabled while a timer is active
  assert.equal((html.match(/class="cardio-option"[^>]*disabled/g) ?? []).length, 2)
  assert.ok(/aria-label="Edit cardio session"[^>]*disabled/.test(html) || /disabled[^>]*aria-label="Edit cardio session"/.test(html))
})

test('a corrupt saved timer is ignored instead of crashing the page', () => {
  for (const junk of ['{not json', '{}', JSON.stringify({ status: 'running' }), 'null', '"text"']) {
    const text = plain(withStorage(junk, () => cardioPage()))
    assert.ok(text.includes('What did you do?'), junk)
    assert.ok(!text.includes('Live timer'), junk)
  }
})

test('a date chosen on the calendar pre-fills the form', () => {
  const html = cardioPage(appData(), '2026-10-12')
  assert.ok(html.includes('value="2026-10-12"'))
})

// ============================ Nutrition page: one definition of intake =========================
const nutrition = (data: ReturnType<typeof appData>) =>
  plain(renderToString(<NutritionPage data={data} refresh={noop} inform={quiet} />))

test('nutrition counts quick-add calories with the food log, like the dashboard does', () => {
  const data = appData({ foods: [food(TODAY, 600, { name: 'Dal rice' })], quickEntries: [quick(TODAY, 400, { note: 'snack out' })] })
  const text = nutrition(data)
  assert.ok(text.includes('1,000 kcal'), 'consumed = 600 food + 400 quick-add')
  assert.ok(text.includes('1 food item + 400 kcal quick-add'))
  assert.ok(text.includes('1,200 kcal'), 'remaining against the 2,200 target')
  assert.ok(text.includes('Quick-add calories for'))
  assert.ok(text.includes('snack out'))
})

test('nutrition says "Not logged" when nothing is recorded, and shows a recorded zero as zero', () => {
  assert.ok(nutrition(appData()).includes('Not logged'))
  const zero = nutrition(appData({ quickEntries: [quick(TODAY, 0, { source: 'set' })] }))
  assert.ok(zero.includes('0 kcal'))
  assert.ok(!zero.includes('Not logged'))
})

// ============================ Day detail =======================================================
const detail = (data: ReturnType<typeof appData>, date = TODAY) => plain(renderToString(<DateDetail data={data} date={date} openLog={quiet} />))

test('a discarded workout is not reported as a completed one', () => {
  const text = detail(appData({ workouts: [workout({ session_date: TODAY, status: 'discarded' })] }))
  assert.ok(text.includes('No workout has been logged.'))
  assert.ok(!text.includes('completed strength session'))
})

test('an in-progress workout is described as in progress', () => {
  const text = detail(appData({ workouts: [workout({ session_date: TODAY, status: 'in_progress' })] }))
  assert.ok(text.includes('A strength workout is in progress.'))
  assert.ok(!text.includes('completed strength session'))
})

test('a day with a finished workout shows sets and a calorie summary', () => {
  const done = workout({ id: 'w-done', session_date: TODAY, total_duration_minutes: 60 })
  const data = appData({
    workouts: [done, workout({ session_date: TODAY, status: 'discarded' })],
    sets: [set('w-done', { completed: true }), set('w-done', { completed: true, set_number: 2 }), set('w-done', { completed: false, set_number: 3 })],
    quickEntries: [quick(TODAY, 1000)],
    cardio: [cardio({ session_date: TODAY, average_speed_kmh: 6, incline_percent: 0 })],
  })
  const text = detail(data)
  assert.ok(text.includes('1 completed strength session · 2 completed sets'), 'one completed session, two completed sets (discarded and unfinished ones excluded)')
  assert.ok(text.includes('1,000 kcal eaten'))
  assert.ok(text.includes('kcal exercise (est.)'))
  assert.ok(text.includes('deficit (est.)'))
})

test('a day with nothing recorded says so for calories too', () => {
  const text = detail(appData())
  assert.ok(text.includes('Calorie intake not recorded'))
  assert.ok(text.includes('no exercise estimate'))
})

// ============================ Calorie dashboard ================================================
const rings = (data = appData(), props: { intakeAvailable?: boolean } = {}) =>
  renderToString(
    <CalorieDashboard userId={data.userId} today={TODAY} profile={data.profile} weights={data.weights} foods={data.foods} quickEntries={data.quickEntries} cardio={data.cardio} workouts={data.workouts} intakeAvailable={props.intakeAvailable ?? true} refresh={noop} inform={quiet} />,
  )

test('the dashboard shows three rings with accessible labels and the Add / Set actions', () => {
  const html = rings()
  assert.equal((html.match(/class="calorie-ring"/g) ?? []).length, 3)
  const text = plain(html)
  assert.ok(html.includes('aria-label="Estimated exercise calories today: 0 kilocalories, 0% of a 500 kilocalorie goal"'))
  assert.ok(html.includes('aria-label="No calorie intake recorded today"'))
  assert.ok(text.includes('Add calories'))
  assert.ok(text.includes('Set day’s total'))
  assert.ok(text.includes('No completed exercise recorded today.'))
  assert.ok(text.includes('Resets at midnight (Asia/Kolkata)'))
})

test('the exercise ring follows the colour bands', () => {
  assert.ok(rings().includes('stroke="#c86b62"'), '0% is red')
  const run = [cardio({ session_date: TODAY, average_speed_kmh: 6, incline_percent: 10 })] // 298 kcal of a 500 kcal goal
  const html = rings(appData({ cardio: run }))
  assert.ok(html.includes('stroke="#c5a94c"'), '59% is yellow')
  assert.ok(plain(html).includes('59%'))
  const big = rings(appData({ cardio: run, profile: profile({ daily_exercise_calorie_goal: 250 }) }))
  assert.ok(big.includes('stroke="#4f7a57"'), '119% is green')
  assert.ok(plain(big).includes('+48 kcal'), 'the amount over goal is shown')
})

test('balance: deficit, surplus, and missing inputs are all stated plainly', () => {
  const deficit = plain(rings(appData({ quickEntries: [quick(TODAY, 2000)] })))
  assert.ok(deficit.includes('Estimated deficit'))
  assert.ok(deficit.includes('+500 kcal deficit'))
  const surplus = plain(rings(appData({ quickEntries: [quick(TODAY, 3000)] })))
  assert.ok(surplus.includes('Estimated surplus'))
  assert.ok(surplus.includes('− 500 kcal surplus') || surplus.includes('−500 kcal surplus'))
  const noMaintenance = plain(rings(appData({ profile: profile({ maintenance_calorie_target: null }), quickEntries: [quick(TODAY, 2000)] })))
  assert.ok(noMaintenance.includes('Not enough data'))
  assert.ok(noMaintenance.includes('Missing: a maintenance estimate'))
  assert.ok(noMaintenance.includes('Nothing is assumed in their place'))
})

test('goals that are not set are shown as not set, not as zero', () => {
  const text = plain(rings(appData({ profile: profile({ daily_calorie_target: null, daily_exercise_calorie_goal: null, daily_deficit_target: null }) })))
  assert.ok(text.includes('no goal set'))
  assert.ok(text.includes('Exercise goal: not set'))
  assert.ok(text.includes('Intake goal: not set'))
  assert.ok(text.includes('Target: not set'))
})

test('without the calorie migration the add form is replaced by instructions', () => {
  const text = plain(rings(appData(), { intakeAvailable: false }))
  assert.ok(text.includes('Manual calories need a database update'))
  assert.ok(text.includes('20261029_calorie_tracking.sql'))
  assert.ok(!text.includes('Add calories'))
})

test('the maintenance mode is explained (included vs added)', () => {
  const included = plain(rings(appData()))
  assert.ok(included.includes('includes usual exercise, so logged workouts are not added again'))
  const added = plain(rings(appData({ profile: profile({ maintenance_includes_exercise: false }), cardio: [cardio({ session_date: TODAY, average_speed_kmh: 6, incline_percent: 0 })] })))
  assert.ok(added.includes('is added to your maintenance figure'))
})

// ============================ Workout page =====================================================
const workoutPage = (data: ReturnType<typeof appData>) =>
  plain(renderToString(<WorkoutPage data={data} today={TODAY} refresh={noop} inform={quiet} initialDate={null} />))

test('with no active workout the routines are offered', () => {
  const text = workoutPage(appData({ workouts: [workout({ session_date: TODAY, status: 'discarded' })] }))
  assert.ok(text.includes('Strength training'))
  assert.ok(text.includes('Start this workout'))
  assert.ok(!text.includes('Live workout'), 'a discarded session is not shown as active')
})

test('an in-progress workout from the database is restored, with a confirmed discard', () => {
  const data = appData({ workouts: [workout({ id: 'live', title: 'Chest day', session_date: TODAY, status: 'in_progress', workout_plan_id: `p${weekday(TODAY)}`, started_at: new Date().toISOString() })] })
  const text = workoutPage(data)
  assert.ok(text.includes('Live workout'))
  assert.ok(text.includes('Chest day'))
  assert.ok(text.includes('Discard workout'))
  assert.ok(text.includes('Only one workout can be active at a time'))
  assert.ok(!text.includes('Start this workout'), 'other routines cannot be started while one is active')
})

test('a workout left open from an earlier day is flagged, not hidden or altered', () => {
  const data = appData({ workouts: [workout({ id: 'old', title: 'Legs', session_date: addDays(TODAY, -2), status: 'in_progress', started_at: `${addDays(TODAY, -2)}T05:00:00Z` })] })
  const text = workoutPage(data)
  assert.ok(text.includes('This workout is still open'))
  assert.ok(text.includes('started on'))
  assert.ok(text.includes('Discard workout'))
})

// ============================ Dashboard ========================================================
const dashboard = (data: ReturnType<typeof appData>) =>
  plain(renderToString(<Dashboard data={data} today={TODAY} intakeAvailable setPage={quiet} openLog={quiet} refresh={noop} inform={quiet} />))

test('the dashboard offers to resume an active workout and labels the cardio shortcut', () => {
  const resumed = dashboard(appData({ workouts: [workout({ session_date: TODAY, status: 'in_progress', started_at: new Date().toISOString() })] }))
  assert.ok(resumed.includes('Resume workout'))
  assert.ok(resumed.includes('Log cardio'))
  assert.ok(!resumed.includes('Start treadmill'))
  assert.ok(resumed.includes('Exercise, intake and balance'), 'the three rings are on the dashboard')
  assert.ok(dashboard(appData()).includes('Start workout'))
})

// ============================ Progress page ====================================================
const progress = (data: ReturnType<typeof appData>) =>
  plain(renderToString(<ProgressPage data={data} today={TODAY} inform={quiet} />))

test('the training streak survives a morning with no workout yet', () => {
  const data = appData({ workouts: [workout({ session_date: YESTERDAY }), workout({ session_date: addDays(TODAY, -2) })] })
  const text = progress(data)
  assert.ok(text.includes('Training streak 2 days'), `expected a 2-day streak, got: ${text.slice(0, 200)}`)
})

test('monthly consistency compares month-to-date completions with month-to-date plan', () => {
  // A fixed date, so the check is the same on every day it runs: Saturday 10 Oct 2026, no rest days.
  // Planned so far this month = 10 days. Completed this month = 2 (the 30 Sep session belongs to last month).
  const fixedToday = '2026-10-10'
  const data = appData({ workouts: ['2026-10-09', '2026-10-08', '2026-09-30'].map((session_date) => workout({ session_date })) })
  const text = plain(renderToString(<ProgressPage data={data} today={fixedToday} inform={quiet} />))
  assert.ok(text.includes('Monthly consistency 20%'), `expected 20% (2 of 10 planned days) in: ${text.slice(0, 300)}`)
  // Early in a month a single session is a good start, not 3%: the old rolling 31-day window gave 2/31 = 6%.
  assert.ok(!text.includes('Monthly consistency 6%'))
})

test('monthly consistency is capped at 100%', () => {
  const sessions = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03'].map((session_date) => workout({ session_date }))
  const text = plain(renderToString(<ProgressPage data={appData({ workouts: sessions })} today="2026-10-03" inform={quiet} />))
  assert.ok(text.includes('Monthly consistency 100%'), text.slice(0, 300)) // 4 sessions against 3 planned days
})

test('monthly consistency ignores sessions dated after today', () => {
  // Today is 10 Oct (10 planned days so far). Two sessions are in the past; three carry future dates.
  const dates = ['2026-10-09', '2026-10-08', '2026-10-12', '2026-10-13', '2026-10-14']
  const data = appData({ workouts: dates.map((session_date) => workout({ session_date })) })
  const text = plain(renderToString(<ProgressPage data={data} today="2026-10-10" inform={quiet} />))
  assert.ok(text.includes('Monthly consistency 20%'), `expected 20% in: ${text.slice(0, 300)}`) // not 5 of 10 = 50%
})

test('the progress page offers the monthly report download', () => {
  const text = progress(appData())
  assert.ok(text.includes('Download a month'))
  assert.ok(text.includes('Readable report (.md)'))
  assert.ok(text.includes('Structured data (.json)'))
  assert.ok(text.includes('never as zero'))
})
