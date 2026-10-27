-- Apply this after the earlier schema when upgrading an existing Gym Ledger database.
-- It makes workout completion idempotent and atomic: one retry cannot duplicate sets.
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
