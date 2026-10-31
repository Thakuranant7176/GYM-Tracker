-- Database checks for the workout lifecycle and manual calorie intake.
--
-- NOT YET EXECUTED: these were written without access to a Postgres/Supabase instance.
-- Run them yourself, in a scratch or staging project, AFTER applying both migrations:
--   supabase/migrations/20261029_workout_lifecycle.sql
--   supabase/migrations/20261029_calorie_tracking.sql
-- Paste the whole file into the Supabase SQL editor (role: postgres) and run it.
-- It creates two throwaway users, impersonates each one through the `authenticated` role so
-- Row Level Security really applies, checks the results with ASSERT, and ends with ROLLBACK,
-- so nothing is kept. A failed check aborts with a message naming it; success prints
-- "ALL CHECKS PASSED". Do not run it against production data you cannot afford to lock briefly.

begin;

-- Fixtures (as postgres) ---------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'test-a@example.invalid'),
       ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'test-b@example.invalid');

insert into public.workout_plans (id, user_id, name, weekday)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'Test Push', 1);
insert into public.exercises (id, user_id, name, primary_muscle)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111', 'Test Bench', 'Chest');
insert into public.food_entries (user_id, entry_date, name, meal_type, calories)
values ('11111111-1111-4111-8111-111111111111', '2026-01-15', 'Test meal', 'lunch', 400);

-- ===== As user A: workout lifecycle ====================================================
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  plan_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  ex_a constant uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  me constant uuid := '11111111-1111-4111-8111-111111111111';
  s1 public.workout_sessions; s2 public.workout_sessions; s3 public.workout_sessions;
  s4 public.workout_sessions; s5 public.workout_sessions; s6 public.workout_sessions;
  n integer; failed boolean; st text;
begin
  -- start: one active session, dated with the IST calendar day
  s1 := public.start_workout(plan_a, null, null);
  assert s1.status = 'in_progress', 'start creates an in_progress session';
  assert s1.session_date = (now() at time zone 'Asia/Kolkata')::date, 'new session is dated with the IST date';
  assert s1.started_at is not null, 'started_at is set';
  assert s1.title = 'Test Push', 'title defaults to the plan name';

  -- a second start (double tap / second device) returns the same session, never a duplicate
  s2 := public.start_workout(plan_a, null, null);
  assert s2.id = s1.id, 'second start returns the existing active session';
  select count(*) into n from public.workout_sessions where status = 'in_progress';
  assert n = 1, 'exactly one active session';

  -- complete: sets stored once, status/timestamps set, completed flag follows status
  perform public.complete_workout(s1.id, 'felt good', jsonb_build_array(
    jsonb_build_object('exercise_id', ex_a, 'set_number', 1, 'reps', 8, 'weight_kg', 60, 'completed', true),
    jsonb_build_object('exercise_id', ex_a, 'set_number', 2, 'reps', 6, 'weight_kg', 60, 'completed', true)));
  select status into st from public.workout_sessions where id = s1.id;
  assert st = 'completed', 'complete_workout marks the session completed';
  assert (select completed from public.workout_sessions where id = s1.id), 'legacy completed flag follows status';
  assert (select completed_at from public.workout_sessions where id = s1.id) is not null, 'completed_at is set';
  select count(*) into n from public.workout_sets where workout_session_id = s1.id;
  assert n = 2, 'two sets stored';

  -- completing again (a retry after a lost response) does not duplicate anything
  perform public.complete_workout(s1.id, 'felt good', jsonb_build_array(
    jsonb_build_object('exercise_id', ex_a, 'set_number', 1, 'reps', 8, 'weight_kg', 60, 'completed', true),
    jsonb_build_object('exercise_id', ex_a, 'set_number', 2, 'reps', 6, 'weight_kg', 60, 'completed', true),
    jsonb_build_object('exercise_id', ex_a, 'set_number', 3, 'reps', 5, 'weight_kg', 60, 'completed', true)));
  select count(*) into n from public.workout_sets where workout_session_id = s1.id;
  assert n = 2, 'a repeated complete_workout adds no sets and does not rewrite history';

  -- discarding completed history is refused
  failed := false;
  begin perform public.discard_workout(s1.id); exception when others then failed := true; end;
  assert failed, 'a completed workout cannot be discarded';
  assert (select status from public.workout_sessions where id = s1.id) = 'completed', 'history unchanged after refused discard';

  -- the slot is free again; a new session can start and is a different row
  s3 := public.start_workout(plan_a, null, null);
  assert s3.id <> s1.id and s3.status = 'in_progress', 'a new session starts after completion';

  -- the database itself refuses a second active row, however it is inserted
  failed := false;
  begin
    insert into public.workout_sessions (user_id, session_date, title, status) values (me, current_date, 'duplicate', 'in_progress');
  exception when unique_violation then failed := true; end;
  assert failed, 'unique index blocks a second in_progress row (explicit status)';
  failed := false;
  begin
    insert into public.workout_sessions (user_id, session_date, title, completed) values (me, current_date, 'legacy duplicate', false);
  exception when unique_violation then failed := true; end;
  assert failed, 'unique index blocks a second active row from a legacy client (completed = false)';

  -- discard: frees the slot, keeps the row, is idempotent
  perform public.discard_workout(s3.id);
  assert (select status from public.workout_sessions where id = s3.id) = 'discarded', 'discard marks the session discarded';
  assert (select discarded_at from public.workout_sessions where id = s3.id) is not null, 'discarded_at is set';
  perform public.discard_workout(s3.id);
  select count(*) into n from public.workout_sessions where status = 'in_progress';
  assert n = 0, 'no active session after discard';

  -- a discarded session can never be completed (a stale device cannot resurrect it)
  failed := false;
  begin perform public.complete_workout(s3.id, null, '[]'::jsonb); exception when others then failed := true; end;
  assert failed, 'a discarded workout cannot be completed';
  select count(*) into n from public.workout_sets where workout_session_id = s3.id;
  assert n = 0, 'a discarded workout has no sets';

  -- restart after discard
  s4 := public.start_workout(plan_a, null, null);
  assert s4.id <> s3.id and s4.status = 'in_progress', 'restart after discard creates a fresh session';
  perform public.discard_workout(s4.id);

  -- dates: future refused, a past date (logging an earlier day) allowed
  failed := false;
  begin perform public.start_workout(plan_a, ((now() at time zone 'Asia/Kolkata')::date + 2), null); exception when others then failed := true; end;
  assert failed, 'a future-dated workout is refused';
  s5 := public.start_workout(plan_a, date '2020-01-01', null);
  assert s5.session_date = date '2020-01-01', 'a past date is accepted';
  perform public.discard_workout(s5.id);

  -- legacy client compatibility: boolean-only insert/update still works and stays consistent
  insert into public.workout_sessions (user_id, session_date, title, completed) values (me, current_date, 'legacy', false) returning * into s6;
  assert s6.status = 'in_progress', 'legacy insert (completed=false) becomes in_progress';
  update public.workout_sessions set completed = true where id = s6.id;
  assert (select status from public.workout_sessions where id = s6.id) = 'completed', 'legacy completed=true update completes the session';
  update public.workout_sessions set completed = false where id = s6.id;
  assert (select status from public.workout_sessions where id = s6.id) = 'completed', 'completed history cannot be un-completed through the boolean';
  failed := false;
  begin update public.workout_sessions set status = 'in_progress' where id = s6.id; exception when others then failed := true; end;
  assert failed, 'a completed session cannot be reopened';

  -- leave one active session for the isolation checks below
  s6 := public.start_workout(plan_a, null, null);
  perform set_config('test.a_active', s6.id::text, true);
end $$;

-- ===== As user B: isolation ===========================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  a_session uuid := current_setting('test.a_active')::uuid;
  plan_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  a constant uuid := '11111111-1111-4111-8111-111111111111';
  n integer; failed boolean; mine public.workout_sessions;
begin
  select count(*) into n from public.workout_sessions;
  assert n = 0, 'user B sees none of user A''s workout sessions';
  select count(*) into n from public.workout_sets;
  assert n = 0, 'user B sees none of user A''s sets';

  failed := false;
  begin perform public.complete_workout(a_session, null, '[]'::jsonb); exception when others then failed := true; end;
  assert failed, 'user B cannot complete user A''s session';
  failed := false;
  begin perform public.discard_workout(a_session); exception when others then failed := true; end;
  assert failed, 'user B cannot discard user A''s session';
  failed := false;
  begin perform public.start_workout(plan_a, null, null); exception when others then failed := true; end;
  assert failed, 'user B cannot start a workout from user A''s plan';

  -- B has an independent active slot
  mine := public.start_workout(null, null, 'Freestyle');
  assert mine.status = 'in_progress' and mine.user_id = '22222222-2222-4222-8222-222222222222', 'B can start their own workout';
  perform public.discard_workout(mine.id);

  -- calorie intake rows are private
  failed := false;
  begin
    insert into public.calorie_intake_entries (id, user_id, entry_date, calories) values (gen_random_uuid(), a, '2026-01-15', 100);
  exception when others then failed := true; end;
  assert failed, 'user B cannot insert an intake row for user A';
end $$;

-- ===== As user A: manual calorie intake ================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  me constant uuid := '11111111-1111-4111-8111-111111111111';
  x1 constant uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  x2 constant uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  x3 constant uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  n integer; total integer; failed boolean;
begin
  -- add + retry with the same id (what a double tap / lost response looks like)
  insert into public.calorie_intake_entries (id, user_id, entry_date, calories) values (x1, me, '2026-01-15', 500)
    on conflict (id) do nothing;
  insert into public.calorie_intake_entries (id, user_id, entry_date, calories) values (x1, me, '2026-01-15', 500)
    on conflict (id) do nothing;
  select count(*), sum(calories) into n, total from public.calorie_intake_entries where entry_date = '2026-01-15';
  assert n = 1 and total = 500, 'a repeated add with the same id is stored once';

  -- set: day total becomes exactly 2000 with a 400 kcal food entry already logged
  perform public.set_daily_intake_total(x2, '2026-01-15', 2000, 'set by test');
  select count(*), sum(calories) into n, total from public.calorie_intake_entries where entry_date = '2026-01-15';
  assert n = 1 and total = 1600, 'set replaces earlier quick-adds with one row holding the difference to the food log';
  assert (select source from public.calorie_intake_entries where entry_date = '2026-01-15') = 'set', 'the replacement row is marked as a set';
  assert (select count(*) from public.food_entries where entry_date = '2026-01-15') = 1, 'the food log is untouched by a set';

  -- retry of the same set request changes nothing
  perform public.set_daily_intake_total(x2, '2026-01-15', 2000, 'set by test');
  select count(*), sum(calories) into n, total from public.calorie_intake_entries where entry_date = '2026-01-15';
  assert n = 1 and total = 1600, 'a repeated set with the same id is a no-op';

  -- cannot set below what the food log already totals; cannot set outside 0..20000
  failed := false;
  begin perform public.set_daily_intake_total(gen_random_uuid(), '2026-01-15', 399, null); exception when others then failed := true; end;
  assert failed, 'set below the food-log total is refused';
  failed := false;
  begin perform public.set_daily_intake_total(gen_random_uuid(), '2026-01-15', 20001, null); exception when others then failed := true; end;
  assert failed, 'set above 20,000 is refused';
  failed := false;
  begin perform public.set_daily_intake_total(gen_random_uuid(), '2026-01-15', -1, null); exception when others then failed := true; end;
  assert failed, 'a negative total is refused';

  -- an explicit 0 on a day with no food is stored as a 0 row ("ate nothing" is not "nothing recorded")
  perform public.set_daily_intake_total(x3, '2026-01-16', 0, null);
  select count(*), coalesce(sum(calories), -1) into n, total from public.calorie_intake_entries where entry_date = '2026-01-16';
  assert n = 1 and total = 0, 'an explicit zero day is recorded as a 0 kcal row';

  -- table constraints
  failed := false;
  begin insert into public.calorie_intake_entries (user_id, entry_date, calories) values (me, '2026-01-17', 20001); exception when check_violation then failed := true; end;
  assert failed, 'calories above 20,000 violate the check constraint';
  failed := false;
  begin insert into public.calorie_intake_entries (user_id, entry_date, calories) values (me, '2026-01-17', -5); exception when check_violation then failed := true; end;
  assert failed, 'negative calories violate the check constraint';
end $$;

reset role;
do $$ begin raise notice 'ALL CHECKS PASSED'; end $$;
rollback;
