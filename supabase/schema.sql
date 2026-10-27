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
  notes text, total_duration_minutes integer check (total_duration_minutes >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
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

create index weight_entries_user_date on public.weight_entries(user_id, entry_date desc);
create index food_entries_user_date on public.food_entries(user_id, entry_date desc);
create index cardio_sessions_user_date on public.cardio_sessions(user_id, session_date desc);
create index workout_sessions_user_date on public.workout_sessions(user_id, session_date desc);
create index workout_sets_session on public.workout_sets(workout_session_id);
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

-- Completing a workout is one transaction. This prevents a connection retry from
-- inserting the same set rows twice after the workout itself was marked complete.
create or replace function public.complete_workout(
  p_workout_session_id uuid,
  p_notes text,
  p_sets jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_completed boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(coalesce(p_sets, '[]'::jsonb)) <> 'array' then
    raise exception 'Workout sets must be an array';
  end if;

  select completed into v_completed
  from public.workout_sessions
  where id = p_workout_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'Workout session not found'; end if;
  -- The client may retry after a successful commit but before it received the response.
  if v_completed then return; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_sets) as item(exercise_id uuid)
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
  from jsonb_to_recordset(p_sets) as item(
    exercise_id uuid, set_number smallint, reps smallint, weight_kg numeric,
    duration_seconds integer, side text, completed boolean, notes text
  );

  update public.workout_sessions
  set completed = true, notes = p_notes
  where id = p_workout_session_id and user_id = auth.uid();
end; $$;
revoke all on function public.complete_workout(uuid, text, jsonb) from public;
grant execute on function public.complete_workout(uuid, text, jsonb) to authenticated;

-- The UI asks twice before calling this. It must be run by the signed-in user only.
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
