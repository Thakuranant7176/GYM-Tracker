-- Personal Gym Tracker schema. Run this whole file in the Supabase SQL Editor.
-- It stores only authenticated users' records. The browser uses the anon key only.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  setup_completed boolean not null default false,
  timezone text not null default 'Asia/Kolkata',
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  starting_weight_kg numeric(6,2) check (starting_weight_kg between 20 and 500),
  target_weight_kg numeric(6,2) check (target_weight_kg between 20 and 500),
  goal_date date,
  daily_calorie_target integer check (daily_calorie_target between 1 and 20000),
  daily_exercise_calorie_goal integer check (daily_exercise_calorie_goal is null or daily_exercise_calorie_goal between 1 and 20000),
  maintenance_calorie_target integer check (maintenance_calorie_target is null or maintenance_calorie_target between 800 and 15000),
  -- Signed: positive = daily deficit goal, negative = daily surplus goal, 0 = maintain.
  daily_deficit_target integer check (daily_deficit_target is null or daily_deficit_target between -5000 and 5000),
  maintenance_includes_exercise boolean not null default true,
  protein_target_g numeric(6,1) check (protein_target_g >= 0),
  carb_target_g numeric(6,1) check (carb_target_g >= 0),
  fat_target_g numeric(6,1) check (fat_target_g >= 0),
  weekly_cardio_goal_minutes integer check (weekly_cardio_goal_minutes >= 0),
  activity_scoring jsonb not null default '{"strength_complete_points":40,"set_points":5,"cardio_minute_points":1,"low_threshold":10,"moderate_threshold":30,"high_threshold":55,"very_high_threshold":80}'::jsonb,
  active_gym_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gym_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100), location text, notes text,
  archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_active_gym_fkey foreign key (active_gym_id) references public.gym_profiles(id) on delete set null;

create table public.equipment (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  gym_id uuid references public.gym_profiles(id) on delete set null, name text not null check (char_length(trim(name)) between 1 and 140),
  category text not null default 'machine', manufacturer text, model text, settings text, notes text,
  archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 140), primary_muscle text not null,
  secondary_muscles text[] not null default '{}', equipment_id uuid references public.equipment(id) on delete set null,
  category text not null default 'compound', tracking_type text not null default 'weighted' check (tracking_type in ('weighted','bodyweight','timed','distance','cardio')),
  instructions text, alternatives text[] not null default '{}', default_sets smallint check (default_sets between 1 and 30),
  default_rep_min smallint check (default_rep_min between 0 and 999), default_rep_max smallint check (default_rep_max between 0 and 999),
  archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (default_rep_max is null or default_rep_min is null or default_rep_max >= default_rep_min)
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100), weekday smallint not null check (weekday between 0 and 6),
  is_rest_day boolean not null default false, notes text, archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, weekday, name)
);
create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null, position smallint not null default 0 check (position between 0 and 99),
  planned_sets smallint not null check (planned_sets between 1 and 30), rep_min smallint check (rep_min between 0 and 999), rep_max smallint check (rep_max between 0 and 999),
  target_seconds integer check (target_seconds > 0), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (rep_max is null or rep_min is null or rep_max >= rep_min)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  workout_plan_id uuid references public.workout_plans(id) on delete set null, session_date date not null,
  title text not null check (char_length(trim(title)) between 1 and 150), completed boolean not null default false,
  -- Lifecycle is database-authoritative: in_progress -> completed | discarded (both terminal).
  -- `completed` is kept in step with status for older clients; a trigger derives status when omitted.
  status text not null constraint workout_sessions_status_check check (status in ('in_progress', 'completed', 'discarded')),
  started_at timestamptz, completed_at timestamptz, discarded_at timestamptz,
  notes text, total_duration_minutes integer check (total_duration_minutes >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint workout_sessions_completed_matches_status check (completed = (status = 'completed'))
);
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null, set_number smallint not null check (set_number between 1 and 99),
  reps smallint check (reps between 0 and 999), weight_kg numeric(7,2) check (weight_kg between 0 and 2000),
  duration_seconds integer check (duration_seconds between 0 and 86400), side text check (side in ('left','right','both') or side is null),
  completed boolean not null default false, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null, weight_kg numeric(6,2) not null check (weight_kg between 20 and 500), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, entry_date)
);
create table public.food_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null, name text not null check (char_length(trim(name)) between 1 and 200),
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  calories integer not null check (calories between 0 and 20000), protein_g numeric(7,1) check (protein_g >= 0), carbs_g numeric(7,1) check (carbs_g >= 0), fat_g numeric(7,1) check (fat_g >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('treadmill','cycling','walking','other')), session_date date not null,
  started_at timestamptz, active_seconds integer not null check (active_seconds between 1 and 172800),
  paused_seconds integer check (paused_seconds >= 0), distance_km numeric(8,3) check (distance_km >= 0),
  average_speed_kmh numeric(6,2) check (average_speed_kmh >= 0), incline_percent numeric(5,2) check (incline_percent between 0 and 100),
  heart_rate_bpm smallint check (heart_rate_bpm between 20 and 300), machine_calories integer check (machine_calories >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Manual calorie quick-add rows. The client generates id, so retries/double taps are idempotent.
create table public.calorie_intake_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  calories integer not null check (calories between 0 and 20000),
  note text check (note is null or char_length(note) <= 200),
  source text not null default 'add' check (source in ('add', 'set')),
  created_at timestamptz not null default now()
);

create index weight_entries_user_date on public.weight_entries(user_id, entry_date desc);
create index food_entries_user_date on public.food_entries(user_id, entry_date desc);
create index cardio_sessions_user_date on public.cardio_sessions(user_id, session_date desc);
create index workout_sessions_user_date on public.workout_sessions(user_id, session_date desc);
create index workout_sets_session on public.workout_sets(workout_session_id);
create index workout_sessions_user_status_date on public.workout_sessions(user_id, status, session_date desc);
-- At most one active workout per user: the hard guarantee behind start_workout.
create unique index workout_sessions_one_active_per_user on public.workout_sessions(user_id) where status = 'in_progress';
create index calorie_intake_entries_user_date on public.calorie_intake_entries(user_id, entry_date desc);
create index exercises_user on public.exercises(user_id) where archived = false;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger gym_profiles_updated before update on public.gym_profiles for each row execute function public.set_updated_at();
create trigger equipment_updated before update on public.equipment for each row execute function public.set_updated_at();
create trigger exercises_updated before update on public.exercises for each row execute function public.set_updated_at();
create trigger workout_plans_updated before update on public.workout_plans for each row execute function public.set_updated_at();
create trigger plan_exercises_updated before update on public.plan_exercises for each row execute function public.set_updated_at();
create trigger workout_sessions_updated before update on public.workout_sessions for each row execute function public.set_updated_at();
create trigger workout_sets_updated before update on public.workout_sets for each row execute function public.set_updated_at();
create trigger weight_entries_updated before update on public.weight_entries for each row execute function public.set_updated_at();
create trigger food_entries_updated before update on public.food_entries for each row execute function public.set_updated_at();
create trigger cardio_sessions_updated before update on public.cardio_sessions for each row execute function public.set_updated_at();

-- A profile exists as soon as a person registers; setup only fills its preferences.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.gym_profiles enable row level security;
alter table public.equipment enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_plans enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.weight_entries enable row level security;
alter table public.food_entries enable row level security;
alter table public.cardio_sessions enable row level security;
alter table public.calorie_intake_entries enable row level security;

create policy "profiles_are_private" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "gym_profiles_are_private" on public.gym_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "equipment_is_private" on public.equipment for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exercises_are_private" on public.exercises for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plans_are_private" on public.workout_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plan_exercises_are_private" on public.plan_exercises for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sessions_are_private" on public.workout_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sets_are_private" on public.workout_sets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weights_are_private" on public.weight_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "food_is_private" on public.food_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cardio_is_private" on public.cardio_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calorie_intake_is_private" on public.calorie_intake_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Workout lifecycle: transition guard + legacy-client compatibility ---------------
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

-- Lifecycle functions. Completing a workout is one transaction, idempotent on retry.
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

-- Replace the day's manual calorie total ----------------------------------------
-- "Add" is a plain insert (above). "Set" makes the day's TOTAL intake equal p_total:
-- detailed food entries are kept as they are, the day's earlier quick-add rows are replaced
-- by one row holding the difference (an explicit 0 is stored as a 0 kcal row, so "ate nothing"
-- is distinguishable from "nothing recorded"). Refused when food entries already exceed p_total.
-- Idempotent on p_entry_id.
create or replace function public.set_daily_intake_total(
  p_entry_id uuid,
  p_entry_date date,
  p_total integer,
  p_note text default null
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_food integer;
  v_manual integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_entry_id is null or p_entry_date is null then raise exception 'An entry id and date are required'; end if;
  if p_total is null or p_total < 0 or p_total > 20000 then
    raise exception 'The daily total must be between 0 and 20,000 kcal';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gym-ledger:intake:' || v_uid::text || ':' || p_entry_date::text, 0));

  if exists (select 1 from public.calorie_intake_entries where id = p_entry_id and user_id = v_uid) then
    return; -- retry of a request that already succeeded
  end if;

  select coalesce(sum(calories), 0) into v_food
  from public.food_entries
  where user_id = v_uid and entry_date = p_entry_date;

  if p_total < v_food then
    raise exception 'Detailed food entries for this date already total % kcal. Enter at least that much, or edit the food log.', v_food;
  end if;

  delete from public.calorie_intake_entries
  where user_id = v_uid and entry_date = p_entry_date;

  v_manual := p_total - v_food;
  -- A row is kept when it adds calories, or when it is the only record of an explicit 0 kcal day.
  if v_manual > 0 or v_food = 0 then
    insert into public.calorie_intake_entries (id, user_id, entry_date, calories, note, source)
    values (p_entry_id, v_uid, p_entry_date, v_manual, left(nullif(trim(p_note), ''), 200), 'set');
  end if;
end; $$;

revoke all on function public.set_daily_intake_total(uuid, date, integer, text) from public;
revoke execute on function public.set_daily_intake_total(uuid, date, integer, text) from anon;
grant execute on function public.set_daily_intake_total(uuid, date, integer, text) to authenticated;


-- The UI asks twice before calling this. It must be run by the signed-in user only.
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
