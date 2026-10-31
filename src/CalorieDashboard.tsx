import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, Flame, Utensils } from 'lucide-react'
import {
  balanceProgress,
  calculateDailyCalories,
  calorieProgress,
  calorieProgressColor,
  describeBalance,
  percentLabel,
  RING_COLORS,
} from './calories'
import { describeDbError, MIGRATIONS } from './dbErrors'
import { createSubmissionTracker, validateIntake } from './intake'
import { IST_TIMEZONE, number } from './lib'
import { supabase } from './supabase'
import type { CalorieIntakeEntry, CardioSession, FoodEntry, Profile, WeightEntry, WorkoutSession } from './types'

type Notice = (type: 'success' | 'error', message: string) => void

type CalorieDashboardProps = {
  userId: string
  /** The Asia/Kolkata date being shown. Changes at midnight without a reload. */
  today: string
  profile: Profile
  weights: WeightEntry[]
  foods: FoodEntry[]
  quickEntries: CalorieIntakeEntry[]
  cardio: CardioSession[]
  workouts: WorkoutSession[]
  /** false when the calorie_intake_entries table could not be read (migration not applied). */
  intakeAvailable: boolean
  refresh: () => Promise<void>
  inform: Notice
}

const NEUTRAL = '#8daa91'
const OVER = '#d99451'

function Ring({ percent, color, value, unit, label, title }: { percent: number | null; color: string; value: string; unit: string; label: string; title: string }) {
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const shown = percent == null ? 0 : Math.min(percent, 100)
  return (
    <div className="calorie-ring-wrap" title={title}>
      <svg className="calorie-ring" viewBox="0 0 120 120" role="img" aria-label={label}>
        <circle className="calorie-ring-track" cx="60" cy="60" r={radius} />
        <circle
          className="calorie-ring-progress"
          cx="60"
          cy="60"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="calorie-ring-value" aria-hidden="true">
        <strong>{value}</strong>
        <span>{unit}</span>
        <em>{percent == null ? 'no goal set' : percentLabel(percent)}</em>
      </div>
    </div>
  )
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="calorie-facts">
      {rows.map(([term, detail]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{detail}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One editable number (or empty to clear). Saves through `onSave`, which returns an error message or null. */
function GoalEditor({ label, value, min, max, unit, onSave, clearable = true }: {
  label: string
  value: number | null | undefined
  min: number
  max: number
  unit: string
  onSave: (next: number | null) => Promise<string | null>
  clearable?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = () => {
    setDraft(value == null ? '' : String(value))
    setError(null)
    setEditing(true)
  }
  const save = async () => {
    if (busy) return
    let next: number | null = null
    if (draft.trim() !== '') {
      next = Number(draft)
      if (!Number.isInteger(next) || next < min || next > max) return setError(`Enter a whole number from ${min.toLocaleString()} to ${max.toLocaleString()}.`)
    } else if (!clearable) {
      return setError('A value is required.')
    }
    setBusy(true)
    const failure = await onSave(next)
    setBusy(false)
    if (failure) return setError(failure)
    setEditing(false)
  }
  if (!editing) {
    return (
      <p className="goal-line">
        <span>{label}: <strong>{value == null ? 'not set' : `${number(value)} ${unit}`}</strong></span>
        <button type="button" className="plain-button" onClick={open} aria-label={`Edit ${label.toLowerCase()}`}>{value == null ? 'Set' : 'Edit'}</button>
      </p>
    )
  }
  return (
    <div className="goal-editor">
      <label>
        {label} ({unit})
        <input inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} aria-invalid={error ? true : undefined} />
      </label>
      <div className="calorie-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {error && <p className="calorie-error" role="alert">{error}</p>}
    </div>
  )
}

function BalanceSettings({ profile, onSave }: { profile: Profile; onSave: (patch: Partial<Profile>) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false)
  const [maintenance, setMaintenance] = useState('')
  const [target, setTarget] = useState('')
  const [includes, setIncludes] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = () => {
    setMaintenance(profile.maintenance_calorie_target == null ? '' : String(profile.maintenance_calorie_target))
    setTarget(profile.daily_deficit_target == null ? '' : String(profile.daily_deficit_target))
    setIncludes(profile.maintenance_includes_exercise !== false)
    setError(null)
    setEditing(true)
  }
  const save = async () => {
    if (busy) return
    const parse = (text: string, lo: number, hi: number, name: string): number | null | undefined => {
      if (text.trim() === '') return null
      const parsed = Number(text)
      if (!Number.isInteger(parsed) || parsed < lo || parsed > hi) {
        setError(`${name} must be a whole number from ${lo.toLocaleString()} to ${hi.toLocaleString()}.`)
        return undefined
      }
      return parsed
    }
    const maintenanceValue = parse(maintenance, 800, 15000, 'Maintenance calories')
    if (maintenanceValue === undefined) return
    const targetValue = parse(target, -5000, 5000, 'Daily target')
    if (targetValue === undefined) return
    setBusy(true)
    const failure = await onSave({ maintenance_calorie_target: maintenanceValue, daily_deficit_target: targetValue, maintenance_includes_exercise: includes })
    setBusy(false)
    if (failure) return setError(failure)
    setEditing(false)
  }
  if (!editing) {
    return (
      <div className="goal-block">
        <p className="goal-line">
          <span>Maintenance: <strong>{profile.maintenance_calorie_target == null ? 'not set' : `${number(profile.maintenance_calorie_target)} kcal`}</strong></span>
          <span>Target: <strong>{profile.daily_deficit_target == null ? 'not set' : profile.daily_deficit_target > 0 ? `${number(profile.daily_deficit_target)} kcal deficit` : profile.daily_deficit_target < 0 ? `${number(-profile.daily_deficit_target)} kcal surplus` : 'maintain'}</strong></span>
          <button type="button" className="plain-button" onClick={open} aria-label="Edit maintenance and balance target">Edit</button>
        </p>
      </div>
    )
  }
  return (
    <div className="goal-editor">
      <label>
        Maintenance estimate (kcal / day)
        <input inputMode="numeric" value={maintenance} onChange={(event) => setMaintenance(event.target.value)} placeholder="e.g. 2400" />
      </label>
      <label>
        Daily target (kcal) — positive = deficit, negative = surplus
        <input inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. 500, or -300 for a surplus" />
      </label>
      <fieldset className="goal-radio">
        <legend>My maintenance figure…</legend>
        <label><input type="radio" name="maintenance-mode" checked={includes} onChange={() => setIncludes(true)} /> already includes my usual exercise (logged workouts are NOT added)</label>
        <label><input type="radio" name="maintenance-mode" checked={!includes} onChange={() => setIncludes(false)} /> excludes workouts (logged exercise calories are added)</label>
      </fieldset>
      <div className="calorie-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {error && <p className="calorie-error" role="alert">{error}</p>}
    </div>
  )
}

const timeLabel = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-IN', { timeZone: IST_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : ''

export function CalorieDashboard(props: CalorieDashboardProps) {
  const { today: day, profile } = props
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // One id per distinct submission. It is reused if the same content is retried after an
  // uncertain failure (so the database ignores a duplicate) and replaced as soon as the
  // content changes or the submission succeeds.
  const [submission] = useState(() => createSubmissionTracker())
  const inFlight = useRef(false)
  const newSubmission = () => submission.reset()

  const summary = useMemo(() => calculateDailyCalories({
    date: day,
    profile,
    weights: props.weights,
    foods: props.foods,
    quickEntries: props.quickEntries,
    cardio: props.cardio,
    workouts: props.workouts,
  }), [day, profile, props.weights, props.foods, props.quickEntries, props.cardio, props.workouts])

  const todaysEntries = useMemo(
    () => props.quickEntries.filter((entry) => entry.entry_date === day).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [props.quickEntries, day],
  )

  const saveProfile = async (patch: Partial<Profile>) => {
    const { error } = await supabase!.from('profiles').update(patch).eq('id', props.userId)
    if (error) return describeDbError(error, MIGRATIONS.calories)
    props.inform('success', 'Goals updated.')
    await props.refresh()
    return null
  }

  const submit = async (mode: 'add' | 'set') => {
    if (inFlight.current) return
    const check = validateIntake(mode, amount, { foodCalories: summary.foodCalories, currentTotal: summary.intakeCalories })
    if (!check.ok) return setFormError(check.error)
    const entered = check.value
    if (mode === 'set' && summary.quickAddEntryCount > 0 && !window.confirm(`Replace today’s ${summary.quickAddEntryCount} quick-add ${summary.quickAddEntryCount === 1 ? 'entry' : 'entries'} so the day’s total becomes ${number(entered)} kcal? Food-log entries are not changed.`)) return
    inFlight.current = true
    setSaving(true)
    setFormError(null)
    try {
      const id = submission.current()
      const cleanNote = note.trim() ? note.trim().slice(0, 200) : null
      const result = mode === 'add'
        ? await supabase!.from('calorie_intake_entries').upsert(
          { id, user_id: props.userId, entry_date: day, calories: entered, note: cleanNote, source: 'add' },
          { onConflict: 'id', ignoreDuplicates: true },
        )
        : await supabase!.rpc('set_daily_intake_total', { p_entry_id: id, p_entry_date: day, p_total: entered, p_note: cleanNote })
      if (result.error) {
        const message = describeDbError(result.error, MIGRATIONS.calories)
        setFormError(message)
        props.inform('error', message)
        return
      }
      submission.reset()
      setAmount('')
      setNote('')
      props.inform('success', mode === 'add' ? `${number(entered)} kcal added to today.` : `Today’s total is now ${number(entered)} kcal.`)
      await props.refresh()
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const removeEntry = async (entry: CalorieIntakeEntry) => {
    if (!window.confirm(`Remove this ${number(entry.calories)} kcal quick-add entry?`)) return
    const { error } = await supabase!.from('calorie_intake_entries').delete().eq('id', entry.id)
    if (error) return props.inform('error', describeDbError(error, MIGRATIONS.calories))
    props.inform('success', 'Entry removed.')
    await props.refresh()
  }

  // --- exercise ring ---------------------------------------------------------
  const burnGoal = profile.daily_exercise_calorie_goal
  const burnPercent = burnGoal ? calorieProgress(summary.exerciseCalories, burnGoal) : null
  const burnRemaining = burnGoal ? Math.max(burnGoal - summary.exerciseCalories, 0) : null
  const burnOver = burnGoal ? Math.max(summary.exerciseCalories - burnGoal, 0) : 0

  // --- intake ring -----------------------------------------------------------
  const intakeGoal = profile.daily_calorie_target
  const intake = summary.intakeCalories
  const intakePercent = intakeGoal && intake != null ? calorieProgress(intake, intakeGoal) : intakeGoal ? 0 : null
  const intakeColor = intakeGoal && intake != null && intake > intakeGoal ? OVER : NEUTRAL

  // --- balance ring ----------------------------------------------------------
  const balance = summary.estimatedBalance
  const target = profile.daily_deficit_target
  const balancePercent = balanceProgress(balance, target)
  const onTarget = balance != null && target != null && ((target > 0 && balance > 0) || (target < 0 && balance < 0) || target === 0)
  const balanceColor = balance == null ? NEUTRAL : target == null || target === 0 ? NEUTRAL : onTarget ? RING_COLORS.green : RING_COLORS.red
  const kind = describeBalance(balance)
  const missing = summary.missingInputs.map((item) => (item === 'maintenance' ? 'a maintenance estimate' : 'today’s calorie intake'))

  const exerciseNotes: ReactNode[] = []
  if (summary.exerciseRecordCount === 0) exerciseNotes.push('No completed exercise recorded today.')
  if (summary.unavailableExerciseRecords > 0) exerciseNotes.push(`${summary.unavailableExerciseRecords} of ${summary.exerciseRecordCount} record${summary.exerciseRecordCount === 1 ? '' : 's'} could not be estimated (missing weight, duration or speed) and ${summary.unavailableExerciseRecords === 1 ? 'is' : 'are'} not counted.`)
  if (summary.assumedIntensityRecords > 0) exerciseNotes.push(`${summary.assumedIntensityRecords} estimate${summary.assumedIntensityRecords === 1 ? ' uses' : 's use'} an assumed intensity (no speed or heart data).`)
  if (summary.weightSource === 'starting_weight') exerciseNotes.push('Using your starting weight — log a weigh-in for a closer estimate.')
  if (summary.weightSource == null) exerciseNotes.push('Add a body weight to estimate exercise calories.')

  return (
    <section className="calorie-dashboard" aria-labelledby="calorie-heading">
      <div className="section-heading calorie-heading">
        <div>
          <p className="eyebrow">Today’s energy · estimates</p>
          <h2 id="calorie-heading">Exercise, intake and balance</h2>
          <p className="muted">Resets at midnight (Asia/Kolkata); earlier days are kept. Exercise and balance figures are estimates, not measurements.</p>
        </div>
      </div>
      <div className="calorie-grid">
        <article className="calorie-card" aria-label="Estimated exercise calories">
          <div className="calorie-card-title"><span className="stat-icon"><Flame size={18} /></span><div><p className="eyebrow">Burned through exercise</p><h3>Estimated active calories</h3></div></div>
          <Ring
            percent={burnPercent}
            color={burnPercent == null ? NEUTRAL : calorieProgressColor(burnPercent)}
            value={number(summary.exerciseCalories)}
            unit="kcal (est.)"
            label={`Estimated exercise calories today: ${number(summary.exerciseCalories)} kilocalories${burnGoal ? `, ${percentLabel(burnPercent ?? 0)} of a ${number(burnGoal)} kilocalorie goal` : ', no goal set'}`}
            title="Estimated active calories from today’s completed cardio and strength sessions. Not a measurement."
          />
          <Facts rows={[
            ['Goal', burnGoal ? `${number(burnGoal)} kcal` : 'not set'],
            ['Burned (est.)', `${number(summary.exerciseCalories)} kcal`],
            [burnOver > 0 ? 'Over goal' : 'Remaining', burnGoal == null ? '—' : burnOver > 0 ? `+${number(burnOver)} kcal` : `${number(burnRemaining ?? 0)} kcal`],
            ['Cardio · strength', `${number(summary.cardioCalories)} · ${number(summary.strengthCalories)} kcal`],
          ]} />
          <GoalEditor label="Exercise goal" value={burnGoal} min={1} max={20000} unit="kcal" onSave={(next) => saveProfile({ daily_exercise_calorie_goal: next })} />
          {exerciseNotes.map((text, index) => <p className="calorie-note" key={index}>{text}</p>)}
        </article>

        <article className="calorie-card" aria-label="Calories consumed">
          <div className="calorie-card-title"><span className="stat-icon"><Utensils size={18} /></span><div><p className="eyebrow">Calories consumed</p><h3>Today’s intake</h3></div></div>
          <Ring
            percent={intakePercent}
            color={intakeColor}
            value={intake == null ? '—' : number(intake)}
            unit={intake == null ? 'nothing recorded' : 'kcal'}
            label={intake == null ? 'No calorie intake recorded today' : `Calories consumed today: ${number(intake)} kilocalories${intakeGoal ? `, ${percentLabel(intakePercent ?? 0)} of a ${number(intakeGoal)} kilocalorie goal` : ', no goal set'}`}
            title="Detailed food entries plus manual quick-adds for today. A day with neither is “not recorded”, not zero."
          />
          <Facts rows={[
            ['Goal', intakeGoal ? `${number(intakeGoal)} kcal` : 'not set'],
            ['Consumed', intake == null ? 'not recorded' : `${number(intake)} kcal`],
            [intake != null && intakeGoal && intake > intakeGoal ? 'Over goal' : 'Remaining', intakeGoal == null ? '—' : intake != null && intake > intakeGoal ? `+${number(intake - intakeGoal)} kcal` : `${number(intakeGoal - (intake ?? 0))} kcal`],
            ['Food log · quick-add', `${number(summary.foodCalories)} · ${number(summary.quickAddCalories)} kcal`],
          ]} />
          <GoalEditor label="Intake goal" value={intakeGoal} min={1} max={20000} unit="kcal" onSave={(next) => saveProfile({ daily_calorie_target: next })} />
          {props.intakeAvailable ? (
            <form className="calorie-entry-form" onSubmit={(event) => { event.preventDefault(); void submit('add') }} noValidate>
              <label>
                Calories
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => { setAmount(event.target.value); newSubmission(); setFormError(null) }}
                  placeholder="e.g. 650"
                  aria-describedby="calorie-help"
                  aria-invalid={formError ? true : undefined}
                />
              </label>
              <label>
                Note <span className="optional">optional</span>
                <input value={note} maxLength={200} onChange={(event) => { setNote(event.target.value); newSubmission() }} placeholder="e.g. dinner out" />
              </label>
              <div className="calorie-actions">
                <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Add calories'}</button>
                <button type="button" className="secondary" disabled={saving} onClick={() => void submit('set')}>Set day’s total</button>
              </div>
              <p id="calorie-help" className="calorie-note"><strong>Add</strong> puts the amount on top of today’s total. <strong>Set</strong> makes today’s total exactly that number (your food log is kept; earlier quick-adds are replaced).</p>
              {formError && <p className="calorie-error" role="alert">{formError}</p>}
            </form>
          ) : (
            <p className="calorie-error" role="alert">Manual calories need a database update. Run {MIGRATIONS.calories} in the Supabase SQL editor, then reload.</p>
          )}
          {todaysEntries.length > 0 && (
            <ul className="calorie-entries" aria-label="Today’s quick-add entries">
              {todaysEntries.map((entry) => (
                <li key={entry.id}>
                  <span>{number(entry.calories)} kcal{entry.source === 'set' ? ' (set total)' : ''}{entry.note ? ` · ${entry.note}` : ''} <small>{timeLabel(entry.created_at)}</small></span>
                  <button type="button" className="plain-button" onClick={() => void removeEntry(entry)} aria-label={`Remove ${number(entry.calories)} kilocalorie entry`}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="calorie-card" aria-label="Estimated daily calorie balance">
          <div className="calorie-card-title"><span className="stat-icon"><Activity size={18} /></span><div><p className="eyebrow">Daily balance · estimate</p><h3>{balance == null ? 'Not enough data' : balance > 0 ? 'Estimated deficit' : balance < 0 ? 'Estimated surplus' : 'Estimated maintenance'}</h3></div></div>
          <Ring
            percent={balancePercent}
            color={balanceColor}
            value={balance == null ? '—' : number(Math.abs(balance))}
            unit={balance == null ? 'inputs missing' : `kcal ${kind === 'at maintenance' ? 'balanced' : kind}`}
            label={balance == null ? `Estimated calorie balance unavailable: missing ${missing.join(' and ')}` : `Estimated ${kind} of ${number(Math.abs(balance))} kilocalories today${balancePercent != null ? `, ${percentLabel(balancePercent)} of the ${number(Math.abs(target ?? 0))} kilocalorie ${target && target < 0 ? 'surplus' : 'deficit'} target` : ''}`}
            title="Estimated daily balance = estimated energy expenditure − calories consumed. Positive means deficit, negative means surplus."
          />
          <Facts rows={[
            ['Expenditure (est.)', summary.estimatedExpenditure == null ? 'needs maintenance' : `${number(summary.estimatedExpenditure)} kcal`],
            ['Consumed', intake == null ? 'not recorded' : `${number(intake)} kcal`],
            ['Balance', balance == null ? '—' : `${balance > 0 ? '+' : balance < 0 ? '−' : ''}${number(Math.abs(balance))} kcal ${kind}`],
            ['Target', target == null ? 'not set' : target > 0 ? `${number(target)} kcal deficit` : target < 0 ? `${number(-target)} kcal surplus` : 'maintain'],
          ]} />
          <BalanceSettings profile={profile} onSave={saveProfile} />
          {balance == null && <p className="calorie-note">Missing: {missing.join(' and ')}. Nothing is assumed in their place.</p>}
          {summary.maintenanceCalories != null && (
            <p className="calorie-note">
              {summary.maintenanceIncludesExercise
                ? 'Your maintenance figure includes usual exercise, so logged workouts are not added again.'
                : `Logged exercise (${number(summary.exerciseCalories)} kcal est.) is added to your maintenance figure.`}
            </p>
          )}
          <p className="calorie-note">The day isn’t over: intake so far is compared with a full day’s expenditure, so a deficit can look larger until you’ve logged everything. Estimate only — not a prediction of weight change.</p>
        </article>
      </div>
    </section>
  )
}
