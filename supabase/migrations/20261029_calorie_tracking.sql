-- Calorie rings: goals on the profile + manual calorie intake entries.
--
-- Apply AFTER 20261029_workout_lifecycle.sql (the two do not depend on each other, but the
-- documented order keeps things simple). Safe to run more than once. Additive only.
--
-- Date strategy: entry_date is the Asia/Kolkata calendar date chosen by the client at the
-- moment of entry; created_at is a UTC timestamptz. Nothing is reset at midnight - the
-- dashboard simply starts reading the new date, and every earlier day stays queryable.

begin;

-- 1. Profile goals -----------------------------------------------------------
alter table public.profiles
  add column if not exists daily_exercise_calorie_goal integer,
  add column if not exists maintenance_calorie_target integer,
  add column if not exists daily_deficit_target integer,
  add column if not exists maintenance_includes_exercise boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_exercise_calorie_goal_range') then
    alter table public.profiles add constraint profiles_exercise_calorie_goal_range
      check (daily_exercise_calorie_goal is null or daily_exercise_calorie_goal between 1 and 20000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_maintenance_calorie_range') then
    alter table public.profiles add constraint profiles_maintenance_calorie_range
      check (maintenance_calorie_target is null or maintenance_calorie_target between 800 and 15000);
  end if;
  -- Signed on purpose: positive = daily deficit goal, negative = daily surplus goal, 0 = maintain.
  if not exists (select 1 from pg_constraint where conname = 'profiles_balance_target_range') then
    alter table public.profiles add constraint profiles_balance_target_range
      check (daily_deficit_target is null or daily_deficit_target between -5000 and 5000);
  end if;
end $$;

-- 2. Manual calorie intake entries -------------------------------------------
-- Append-only quick-add rows, independent of food_entries (so macros and meal logging are
-- untouched). The client generates `id`, which makes every submit idempotent: a retry or a
-- double tap re-sends the same id and is ignored instead of adding calories twice.
create table if not exists public.calorie_intake_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  calories integer not null check (calories between 0 and 20000),
  note text check (note is null or char_length(note) <= 200),
  source text not null default 'add' check (source in ('add', 'set')),
  created_at timestamptz not null default now()
);

create index if not exists calorie_intake_entries_user_date
  on public.calorie_intake_entries (user_id, entry_date desc);

alter table public.calorie_intake_entries enable row level security;

drop policy if exists "calorie_intake_is_private" on public.calorie_intake_entries;
create policy "calorie_intake_is_private" on public.calorie_intake_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Replace the day's manual total ------------------------------------------
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

commit;
