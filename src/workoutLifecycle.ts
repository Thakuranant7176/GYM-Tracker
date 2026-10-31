import { istDate } from './lib'
import type { WorkoutPlan, WorkoutSession } from './types'

// ---------------------------------------------------------------------------
// Workout lifecycle, client side.
//
// The DATABASE decides which workout is active (workout_sessions.status = 'in_progress',
// at most one per user, enforced by a unique partial index). The browser never keeps its own
// idea of "the active workout": it derives it from the rows it just loaded. Browser storage
// only holds the in-progress set inputs (a draft) for the session the database says is active.
// ---------------------------------------------------------------------------

type StatusFields = Pick<WorkoutSession, 'status' | 'completed'>

/**
 * Completed means status === 'completed'. A row from a database that has not yet had the
 * lifecycle migration applied has no status, so it falls back to the legacy boolean.
 */
export const isCompletedSession = (session: StatusFields) =>
  session.status ? session.status === 'completed' : session.completed === true

export const isActiveSession = (session: Pick<WorkoutSession, 'status'>) => session.status === 'in_progress'

/**
 * The user's active workout. The database allows only one; if rows from a pre-migration or
 * inconsistent state ever contain several, the most recently started one wins (deterministic,
 * and the same on every device).
 */
export function findActiveSession(workouts: WorkoutSession[]): WorkoutSession | null {
  let best: WorkoutSession | null = null
  for (const session of workouts) {
    if (!isActiveSession(session)) continue
    if (!best || startedKey(session) > startedKey(best)) best = session
  }
  return best
}
const startedKey = (session: WorkoutSession) => `${session.started_at ?? session.created_at ?? ''}|${session.id}`

export type ActiveSessionNotice = {
  /** The session began on an earlier Asia/Kolkata date than today. */
  startedOnEarlierDay: boolean
  /** Whole hours since it started (null when unknown). */
  hoursOpen: number | null
  /** The routine scheduled for today differs from this session's routine. */
  differsFromTodaysRoutine: boolean
  /** Show a prominent "finish or discard" banner. */
  needsAttention: boolean
}

/** Describes an unfinished session so the UI can say plainly why it is still open. */
export function describeActiveSession(
  session: WorkoutSession,
  today: string,
  plans: Pick<WorkoutPlan, 'id' | 'weekday' | 'is_rest_day' | 'archived'>[],
  todaysWeekday: number,
  now: number = Date.now(),
): ActiveSessionNotice {
  const startedOnEarlierDay = session.session_date < today
  const started = session.started_at ?? session.created_at
  const startedMs = started ? new Date(started).getTime() : Number.NaN
  const hoursOpen = Number.isNaN(startedMs) ? null : Math.max(0, Math.floor((now - startedMs) / 3_600_000))
  const todaysPlan = plans.find((plan) => !plan.archived && plan.weekday === todaysWeekday && !plan.is_rest_day)
  const differsFromTodaysRoutine = Boolean(todaysPlan && session.workout_plan_id !== todaysPlan.id)
  return {
    startedOnEarlierDay,
    hoursOpen,
    differsFromTodaysRoutine,
    needsAttention: startedOnEarlierDay || (hoursOpen != null && hoursOpen >= 6),
  }
}

/** What happened to a workout this device knew about once fresh rows have been loaded. */
export type EndedElsewhere = 'completed' | 'discarded' | 'missing'

export function whyWorkoutEnded(sessionId: string, workouts: WorkoutSession[]): EndedElsewhere {
  const row = workouts.find((session) => session.id === sessionId)
  if (!row) return 'missing'
  return isCompletedSession(row) ? 'completed' : 'discarded'
}

export const endedElsewhereMessage: Record<EndedElsewhere, string> = {
  completed: 'This workout was already completed (possibly on another device). Your history has been refreshed.',
  discarded: 'This workout was discarded (possibly on another device). You can start a new one.',
  missing: 'This workout no longer exists in your account. Your records have been refreshed.',
}

/** The Asia/Kolkata date a new session should be filed under. */
export const sessionDateFor = (explicitDate: string | null | undefined, now: number = Date.now()) => explicitDate || istDate(now)

// ---------------------------------------------------------------------------
// Draft storage (temporary UI state only)
// ---------------------------------------------------------------------------

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type StoredDraft<TDraft> = { sessionId: string; drafts: TDraft[]; notes: string; savedAt: string }

export const draftStorageKey = (userId: string) => `gym-ledger-workout-draft-${userId}`

/** Returns the stored draft only if it belongs to `sessionId`; anything else is ignored. */
export function loadDraft<TDraft>(storage: StorageLike | null, userId: string, sessionId: string): StoredDraft<TDraft> | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(draftStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredDraft<TDraft>>
    if (parsed.sessionId !== sessionId || !Array.isArray(parsed.drafts)) return null
    return { sessionId, drafts: parsed.drafts, notes: typeof parsed.notes === 'string' ? parsed.notes : '', savedAt: parsed.savedAt ?? '' }
  } catch {
    return null
  }
}

export function saveDraft<TDraft>(storage: StorageLike | null, userId: string, sessionId: string, drafts: TDraft[], notes: string, now: Date = new Date()) {
  if (!storage) return
  try {
    storage.setItem(draftStorageKey(userId), JSON.stringify({ sessionId, drafts, notes, savedAt: now.toISOString() }))
  } catch {
    // Storage may be full or disabled; the database session is unaffected.
  }
}

export function clearDraft(storage: StorageLike | null, userId: string) {
  try {
    storage?.removeItem(draftStorageKey(userId))
  } catch {
    // ignore
  }
}

export const browserStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
