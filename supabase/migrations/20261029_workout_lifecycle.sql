-- Workout lifecycle: the database, not the browser, decides which workout is active.
--
-- Apply AFTER 20261027_setup_completed.sql and 20261027_atomic_workout_completion.sql.
-- Safe to run more than once. Nothing is deleted: legacy unfinished rows are kept and
-- relabelled, completed history is never modified except to add status/timestamps.
--
-- States (workout_sessions.status):
--   in_progress -> completed   (complete_workout)
--   in_progress -> discarded   (discard_workout)
-- completed and discarded are terminal. A "planned" workout is just a workout_plans row;
-- it only becomes a session when the user starts it.
--
-- Reporting date: session_date is the Asia/Kolkata calendar date on which the session was
-- STARTED. A session that crosses midnight keeps that date for every metric.

begin;

-- 1. New columns -------------------------------------------------------------
alter table public.workout_sessions
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists discarded_at timestamptz;

-- 2. Backfill legacy rows (only rows that have no status yet) ----------------
-- 2a. Completed legacy sessions.
update public.workout_sessions
set status = 'completed',
    started_at = coalesce(started_at, created_at),
    completed_at = coalesce(completed_at, updated_at)
where status is null and completed = true;

-- 2b. Unfinished legacy sessions. The original app kept the "active" workout only in
-- browser storage, so these rows may be orphans from earlier days. Per user, the single
-- newest one created in the last 24 hours stays in_progress (it may be a workout that is
-- running right now); every other unfinished row becomes discarded. Rows are never deleted.
with ranked as (
  select id,
         user_id,
         row_number() over (partition by user_id order by created_at desc, id desc) as rn
  from public.workout_sessions
  where status is null
    and completed = false
    and created_at > now() - interval '24 hours'
)
update public.workout_sessions as s
set status = 'in_progress',
    started_at = coalesce(s.started_at, s.created_at)
from ranked
where s.id = ranked.id
  and ranked.rn = 1
  and not exists (
    select 1 from public.workout_sessions as other
    where other.user_id = s.user_id and other.status = 'in_progress'
  );

update public.workout_sessions
set status = 'discarded',
    started_at = coalesce(started_at, created_at),
    discarded_at = coalesce(discarded_at, now())
where status is null and completed = false;

-- Defensive: any duplicate active rows that already carry a status are resolved the same
-- way (newest stays active) so the unique index below can always be created.
with ranked as (
  select id,
         row_number() over (partition by user_id order by started_at desc nulls last, created_at desc, id desc) as rn
  from public.workout_sessions
  where status = 'in_progress'
)
update public.workout_sessions as s
set status = 'discarded', discarded_at = coalesce(s.discarded_at, now())
from ranked
where s.id = ranked.id and ranked.rn > 1;

-- 3. Constraints -------------------------------------------------------------
-- No default on purpose: the trigger below derives status for older clients that only
-- know the boolean `completed` column.
alter table public.workout_sessions alter column status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_sessions_status_check') then
    alter table public.workout_sessions
      add constraint workout_sessions_status_check
      check (status in ('in_progress', 'completed', 'discarded'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_sessions_completed_matches_status') then
    alter table public.workout_sessions
      add constraint workout_sessions_completed_matches_status
      check (completed = (status = 'completed'));
  end if;
end $$;

-- At most one active workout per user. This is the hard guarantee against duplicate
-- active sessions from double taps, retries and two devices racing.
create unique index if not exists workout_sessions_one_active_per_user
  on public.workout_sessions (user_id)
  where status = 'in_progress';

create index if not exists workout_sessions_user_status_date
  on public.workout_sessions (user_id, status, session_date desc);

-- 4. Transition guard + legacy-client compatibility --------------------------
create or replace function public.workout_sessions_sync_state() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when new.completed then 'completed' else 'in_progress' end;
    end if;
    new.started_at := coalesce(new.started_at, now());
    if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
    if new.status = 'discarded' then new.discarded_at := coalesce(new.discarded_at, now()); end if;
  else
    -- A legacy client that flips only the boolean: follow it when it completes a session,
    -- ignore an attempt to "un-complete" one so history cannot be reopened by accident.
    if new.status is not distinct from old.status and new.completed is distinct from old.completed then
      if new.completed and old.status = 'in_progress' then
        new.status := 'completed';
      end if;
    end if;
    if new.status is distinct from old.status then
      if old.status <> 'in_progress' then
        raise exception 'A % workout cannot change to %', old.status, new.status
          using errcode = 'check_violation';
      end if;
      if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
      if new.status = 'discarded' then new.discarded_at := coalesce(new.discarded_at, now()); end if;
    end if;
  end if;
  new.completed := (new.status = 'completed');
  return new;
end; $$;

drop trigger if exists workout_sessions_sync_state on public.workout_sessions;
create trigger workout_sessions_sync_state
  before insert or update on public.workout_sessions
  for each row execute function public.workout_sessions_sync_state();

-- 5. Lifecycle functions -----------------------------------------------------
-- start_workout: returns the user's active session if one exists (so a second tap or a
-- second device gets the same session back); otherwise creates one. Concurrent callers
-- are serialised per user, and the unique index is the final backstop.
create or replace function public.start_workout(
  p_workout_plan_id uuid,
  p_session_date date default null,
  p_title text default null
) returns public.workout_sessions
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_date date;
  v_plan_name text;
  v_title text;
  v_row public.workout_sessions;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  perform pg_advisory_xact_lock(hashtextextended('gym-ledger:start_workout:' || v_uid::text, 0));

  select * into v_row
  from public.workout_sessions
  where user_id = v_uid and status = 'in_progress'
  limit 1;
  if found then return v_row; end if;

  v_date := coalesce(p_session_date, v_today);
  if v_date > v_today then raise exception 'A workout cannot be dated in the future'; end if;

  if p_workout_plan_id is not null then
    select name into v_plan_name
    from public.workout_plans
    where id = p_workout_plan_id and user_id = v_uid;
    if not found then raise exception 'Workout plan not found'; end if;
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), v_plan_name);
  if v_title is null then raise exception 'A workout title is required'; end if;

  begin
    insert into public.workout_sessions (user_id, workout_plan_id, session_date, title, status, started_at)
    values (v_uid, p_workout_plan_id, v_date, left(v_title, 150), 'in_progress', now())
    returning * into v_row;
  exception when unique_violation then
    select * into v_row
    from public.workout_sessions
    where user_id = v_uid and status = 'in_progress'
    limit 1;
  end;
  return v_row;
end; $$;

-- complete_workout: only an in_progress session can be completed. A repeat call on an
-- already completed session is a no-op (retry after a lost response). A discarded session
-- is refused so a stale device cannot resurrect it. Duration is derived on the server from
-- started_at; sessions left open for more than 4 hours store NULL (unknown) instead of a
-- misleading number, because the calorie estimate must not guess.
create or replace function public.complete_workout(
  p_workout_session_id uuid,
  p_notes text,
  p_sets jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_status text;
  v_started timestamptz;
  v_minutes integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(coalesce(p_sets, '[]'::jsonb)) <> 'array' then
    raise exception 'Workout sets must be an array';
  end if;

  select status, started_at into v_status, v_started
  from public.workout_sessions
  where id = p_workout_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'Workout session not found'; end if;
  if v_status = 'completed' then return; end if;
  if v_status = 'discarded' then
    raise exception 'This workout was discarded and can no longer be completed. Start a new workout to record it.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_sets, '[]'::jsonb)) as item(exercise_id uuid)
    left join public.exercises as exercise on exercise.id = item.exercise_id
    where item.exercise_id is not null and (exercise.id is null or exercise.user_id <> auth.uid())
  ) then
    raise exception 'A workout set references an exercise outside this account';
  end if;

  delete from public.workout_sets
  where workout_session_id = p_workout_session_id and user_id = auth.uid();

  insert into public.workout_sets (
    user_id, workout_session_id, exercise_id, set_number, reps, weight_kg,
    duration_seconds, side, completed, notes
  )
  select
    auth.uid(), p_workout_session_id, item.exercise_id, item.set_number,
    item.reps, item.weight_kg, item.duration_seconds, item.side,
    coalesce(item.completed, false), item.notes
  from jsonb_to_recordset(coalesce(p_sets, '[]'::jsonb)) as item(
    exercise_id uuid, set_number smallint, reps smallint, weight_kg numeric,
    duration_seconds integer, side text, completed boolean, notes text
  );

  if v_started is not null then
    v_minutes := greatest(1, round(extract(epoch from (now() - v_started)) / 60)::integer);
    if v_minutes > 240 then v_minutes := null; end if;
  end if;

  update public.workout_sessions
  set status = 'completed',
      notes = p_notes,
      total_duration_minutes = v_minutes,
      completed_at = now()
  where id = p_workout_session_id and user_id = auth.uid();
end; $$;

-- discard_workout: abandons an unfinished session. Completed history is protected; a repeat
-- call on an already discarded session is a no-op. The row is kept (status = discarded) and
-- is excluded from every total, so the active slot is freed without deleting anything.
create or replace function public.discard_workout(p_workout_session_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_status text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status into v_status
  from public.workout_sessions
  where id = p_workout_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'Workout session not found'; end if;
  if v_status = 'discarded' then return; end if;
  if v_status = 'completed' then
    raise exception 'A completed workout cannot be discarded. Delete the record instead if it was logged by mistake.';
  end if;

  delete from public.workout_sets
  where workout_session_id = p_workout_session_id and user_id = auth.uid();

  update public.workout_sessions
  set status = 'discarded', discarded_at = now()
  where id = p_workout_session_id and user_id = auth.uid();
end; $$;

revoke all on function public.start_workout(uuid, date, text) from public;
revoke all on function public.complete_workout(uuid, text, jsonb) from public;
revoke all on function public.discard_workout(uuid) from public;
revoke execute on function public.start_workout(uuid, date, text) from anon;
revoke execute on function public.complete_workout(uuid, text, jsonb) from anon;
revoke execute on function public.discard_workout(uuid) from anon;
grant execute on function public.start_workout(uuid, date, text) to authenticated;
grant execute on function public.complete_workout(uuid, text, jsonb) to authenticated;
grant execute on function public.discard_workout(uuid) to authenticated;

commit;
