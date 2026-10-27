-- Add an explicit onboarding marker for versions of Gym Ledger that already
-- have a profiles table. Fresh projects also receive this column from schema.sql.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;

-- Preserve existing fully configured accounts when upgrading an older schema.
UPDATE public.profiles AS p
SET setup_completed = true
WHERE p.setup_completed = false
  AND p.starting_weight_kg IS NOT NULL
  AND p.target_weight_kg IS NOT NULL
  AND p.active_gym_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.workout_plans AS wp
    WHERE wp.user_id = p.id
  );
