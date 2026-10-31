import { useMemo, useState } from 'react'
import { Activity, Flame, Settings, Utensils } from 'lucide-react'
import { calculateDailyCalories, calorieProgress, calorieProgressColor } from './calories'
import { number, todayISO } from './lib'
import { supabase } from './supabase'
import type { CardioSession, DailyCalorieTotal, FoodEntry, Profile, WeightEntry, WorkoutSession } from './types'

type Notice = (type: 'success' | 'error', message: string) => void

type CalorieDashboardProps = {
  userId: string
  profile: Profile
  weights: WeightEntry[]
  foods: FoodEntry[]
  manualTotals: DailyCalorieTotal[]
  cardio: CardioSession[]
  workouts: WorkoutSession[]
  refresh: () => Promise<void>
  inform: Notice
  openSettings: () => void
}

function CalorieRing({
  label,
  value,
  goal,
  valueLabel,
  detail,
  color,
}: {
  label: string
  value: number | null
  goal: number | null | undefined
  valueLabel: string
  detail: string
  color?: string
}) {
  const percent = calorieProgress(value, goal)
  const circumference = 2 * Math.PI * 42
  const stroke = color ?? calorieProgressColor(percent)
  return (
    <div className="calorie-ring-wrap">
      <svg className="calorie-ring" viewBox="0 0 108 108" role="img" aria-label={`${label}: ${value == null ? 'unavailable' : `${value} calories`}${goal ? ` of ${goal} calorie goal` : ''}`}>
        <circle className="calorie-ring-track" cx="54" cy="54" r="42" />
        <circle className="calorie-ring-progress" cx="54" cy="54" r="42" stroke={stroke} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(percent, 100) / 100)} />
      </svg>
      <div className="calorie-ring-value"><strong>{value == null ? '—' : number(value)}</strong><span>{valueLabel}</span></div>
      <span className="calorie-ring-percent">{goal ? `${Math.round(percent)}%` : 'Goal needed'}</span>
      <small>{detail}</small>
    </div>
  )
}

export function CalorieDashboard(props: CalorieDashboardProps) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const day = todayISO()
  const summary = useMemo(() => calculateDailyCalories({
    date: day,
    profile: props.profile,
    weights: props.weights,
    foods: props.foods,
    manualTotals: props.manualTotals,
    cardio: props.cardio,
    workouts: props.workouts,
  }), [day, props.profile, props.weights, props.foods, props.manualTotals, props.cardio, props.workouts])

  const saveManualTotal = async (mode: 'add' | 'set') => {
    const entered = Number(amount)
    if (!Number.isFinite(entered) || entered <= 0 || entered > 20000) return props.inform('error', 'Enter a calorie amount between 1 and 20,000.')
    const base = summary.manualTotal ? Number(summary.manualTotal.calories) : summary.foodCalories
    const calories = mode === 'add' ? base + entered : entered
    if (calories > 20000) return props.inform('error', 'The daily calorie total cannot exceed 20,000.')
    setSaving(true)
    const { error } = await supabase!.from('daily_calorie_totals').upsert({
      user_id: props.userId,
      entry_date: day,
      calories,
      notes: note.trim() || null,
    }, { onConflict: 'user_id,entry_date' })
    setSaving(false)
    if (error) return props.inform('error', error.message)
    setAmount('')
    setNote('')
    props.inform('success', mode === 'add' ? 'Calories added to today’s manual total.' : 'Today’s manual calorie total was set.')
    await props.refresh()
  }

  const clearManualTotal = async () => {
    if (!summary.manualTotal || !window.confirm('Clear the manual total? Detailed food entries stay unchanged.')) return
    const { error } = await supabase!.from('daily_calorie_totals').delete().eq('id', summary.manualTotal.id)
    if (error) return props.inform('error', error.message)
    props.inform('success', 'Manual daily total cleared; meal entries are now used.')
    await props.refresh()
  }

  const burnGoal = props.profile.daily_exercise_calorie_goal
  const intakeGoal = props.profile.daily_calorie_target
  const deficitGoal = props.profile.daily_deficit_target
  const balance = summary.estimatedBalance
  const intakeColor = summary.intakeCalories != null && intakeGoal && summary.intakeCalories > intakeGoal
    ? '#c86b62'
    : undefined
  const balanceColor = balance == null ? undefined : balance < 0 ? '#c86b62' : calorieProgressColor(calorieProgress(balance, deficitGoal))

  return (
    <section className="calorie-dashboard" aria-label="Today’s estimated calorie summary">
      <div className="section-heading calorie-heading">
        <div>
          <p className="eyebrow">Daily energy estimate</p>
          <h2>Food, training, and balance — kept distinct.</h2>
          <p className="muted">All exercise and balance numbers are estimates, not measured energy expenditure.</p>
        </div>
        <button className="secondary" onClick={props.openSettings}><Settings size={16} />Edit calorie goals</button>
      </div>
      <div className="calorie-grid">
        <article className="calorie-card">
          <div className="calorie-card-title"><span className="stat-icon"><Flame size={18} /></span><div><p className="eyebrow">Calories burned</p><h3>Exercise activity</h3></div></div>
          <CalorieRing label="Estimated active calories burned today" value={summary.exerciseCalories} goal={burnGoal} valueLabel="active kcal" detail={burnGoal ? `${number(Math.max(burnGoal - summary.exerciseCalories, 0))} kcal to goal` : 'Set an exercise goal in Settings'} />
          <p className="calorie-detail">Cardio {number(summary.cardioCalories)} kcal · strength {number(summary.strengthCalories)} kcal{summary.unavailableExerciseRecords ? ` · ${summary.unavailableExerciseRecords} activity record${summary.unavailableExerciseRecords === 1 ? '' : 's'} unavailable` : ''}</p>
        </article>
        <article className="calorie-card">
          <div className="calorie-card-title"><span className="stat-icon"><Utensils size={18} /></span><div><p className="eyebrow">Calories consumed</p><h3>Recorded intake</h3></div></div>
          <CalorieRing label="Calories consumed today" value={summary.intakeCalories} goal={intakeGoal} valueLabel="kcal" color={intakeColor} detail={summary.intakeCalories == null ? 'No intake recorded today' : intakeGoal ? `${number(Math.max(intakeGoal - summary.intakeCalories, 0))} kcal remaining${summary.intakeCalories > intakeGoal ? ' · over target' : ''}` : 'Set an intake target in Settings'} />
          <form className="calorie-entry-form" onSubmit={(event) => { event.preventDefault(); void saveManualTotal('add') }}>
            <label>Calories consumed<input required inputMode="numeric" min="1" max="20000" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 650" /></label>
            <label>Note <span className="optional">optional</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Dinner total" /></label>
            <div className="calorie-actions"><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Add calories'}</button><button type="button" className="secondary" disabled={saving} onClick={() => void saveManualTotal('set')}>Set today’s total</button></div>
          </form>
          <p className="calorie-detail">{summary.manualTotal ? 'Manual total is active and intentionally overrides detailed meal-item calories for today.' : `${summary.foodEntryCount} detailed food entr${summary.foodEntryCount === 1 ? 'y' : 'ies'} currently counted.`} {summary.manualTotal && <button className="plain-button calorie-clear" onClick={() => void clearManualTotal()}>Clear manual total</button>}</p>
          <p className="calorie-warning">Over the intake target is not automatically success or failure; it is only a comparison with your chosen target.</p>
        </article>
        <article className="calorie-card">
          <div className="calorie-card-title"><span className="stat-icon"><Activity size={18} /></span><div><p className="eyebrow">Daily balance</p><h3>{balance == null ? 'Estimate unavailable' : balance >= 0 ? 'Estimated deficit' : 'Estimated surplus'}</h3></div></div>
          <CalorieRing label="Estimated daily calorie balance" value={balance == null ? null : Math.abs(balance)} goal={deficitGoal} valueLabel={balance == null ? 'configure maintenance' : balance >= 0 ? 'kcal deficit' : 'kcal surplus'} color={balanceColor} detail={balance == null ? 'Add a maintenance estimate and intake record' : deficitGoal ? `${number(Math.max(deficitGoal - Math.max(balance, 0), 0))} kcal to deficit goal` : 'Set a deficit goal in Settings'} />
          <p className="calorie-detail">{summary.estimatedExpenditure == null ? 'Maintenance calories are not configured.' : `Estimated expenditure ${number(summary.estimatedExpenditure)} kcal${props.profile.maintenance_includes_exercise ? ' · exercise already included in maintenance' : ' · recorded exercise added'}`}</p>
          <p className="calorie-warning">Method: maintenance estimate ± logged activity. It cannot predict exact weight change.</p>
        </article>
      </div>
    </section>
  )
}
