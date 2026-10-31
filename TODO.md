# Project TODO

Status is based on source inspection and tests available in the current review, not assumptions from an earlier completion message.

## P0 — Next concrete actions for the calorie-ring / lifecycle work (2026-10-31)

- [ ] On the Mac: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build && pnpm lint`. Only typecheck and `pnpm test` have been run on this code.
- [ ] Review the changes, then commit on a branch. `App.tsx` was reformatted wholesale by a previous AI, so no plain, `-w` or word diff against `cc5336b` is readable; review it feature by feature using the CHANGELOG, or format the `cc5336b` version with the same formatter first. Nothing has been committed, pushed or deployed.
- [ ] Before the lifecycle migration on the live database, run `select user_id, count(*) from workout_sessions where completed = false group by 1;` to see which legacy unfinished rows will be kept active or marked discarded.
- [ ] Apply, in order, `supabase/migrations/20261029_workout_lifecycle.sql` then `20261029_calorie_tracking.sql` to a scratch/staging Supabase project first. Neither has been executed anywhere yet.
- [ ] Run `supabase/tests/lifecycle_and_intake.test.sql` in that project and fix anything it reports (it rolls back; written without a database to run it against).
- [ ] Then apply to production, deploy the frontend, and walk through checklist items 8–11 in the README (refresh/discard/second device, Add vs Set, midnight rollover, empty-month report).
- [ ] Set maintenance calories, the balance target and the exercise goal in Settings (or on the dashboard); decide whether your maintenance figure already includes exercise.

## P0 — Required before relying on the tracker

- [ ] Create/configure Supabase and run `supabase/schema.sql` for a new project (or apply reviewed migrations for an existing project).
- [ ] Test first registration and email confirmation; verify onboarding appears for the trigger-created profile.
- [ ] Verify onboarding creates the configured gym and all default workout plan/exercise links, including retry after an interrupted setup.
- [ ] Register two accounts and verify RLS prevents either user from reading or changing the other's records.
- [ ] Test CRUD for weight, nutrition, cardio, exercise/equipment, and workouts against the live cloud database.
- [ ] Test the cardio timer and active strength draft through pause, refresh, navigation, completion, and error cases.
- [ ] Deploy through GitHub Pages Actions and verify the site path, favicon, signup confirmation redirect, and Supabase allowed redirect URLs.

## P1 — Recommended polish

- [ ] Browser-test the rings at ~1200, ~700 and ~390 px widths (3, 2, 1 columns), and the live midnight rollover. No component/browser tests exist yet; a DOM-based test setup would need new dev dependencies.
- [ ] The main data load still uses a plain `select *` (PostgREST cap: 1,000 rows) for most tables; only `workout_sets` and the monthly report paginate. Fine for months of use; paginate more tables for years of data.
- [ ] The Weight/Nutrition forms keep their initial date if left open across midnight (the date field is visible and editable).
- [ ] Optional: store the strength draft's inputs in the database so unfinished set entries also follow the user across devices (the session itself already does).

- [ ] Verify the deployed dashboard heatmap visually at mobile and desktop widths with real saved entries, including a phone that reports an approximately 800 px CSS viewport.
- [ ] Test exports with empty and populated records; verify CSV contains enough labels to distinguish record types.

## Completed 2026-10-31 (code complete; verification as listed above)

- [x] Dashboard rings: estimated exercise calories (goal, remaining, percent, red→green colours), calories consumed (Add vs Set, retry-safe, editable goal) and estimated daily balance (maintenance − intake, configurable target and maintenance, no double counting). Needs migrations to be applied.
- [x] Midnight (`Asia/Kolkata`) rollover without a refresh; IST-only date maths; sessions attributed to their start date.
- [x] Monthly report (Markdown + JSON) with provenance labels, gaps, PRs, streaks, balance, and user-data boundaries.
- [x] Workout lifecycle moved into the database (`in_progress` / `completed` / `discarded`, one active per user, confirmed discard, stale-session handling, legacy-row handling) — SQL written, not executed.
- [x] 149 tests (`pnpm test`: unit tests plus server-render tests of the main screens); SQL verification script written (`supabase/tests/`).
- [x] Repaired the inherited uncommitted work, which did not compile.
- [x] Cardio logging rebuilt around three options (cycling / treadmill with speed and incline / walking), retry-safe inserts, edits that never rewrite untouched data, per-session calorie estimates in history.
- [x] Discrepancy fixes found in review: Nutrition page and weekly chart now include quick-add calories; the day-detail panel no longer counts discarded or unfinished workouts as completed and shows that day's calories; the Progress "monthly consistency" compared a rolling 31-day plan with month-to-date completions; the training streak reset to 0 until you trained today; food/weight forms got proper validation, double-submit protection and a plain message for a duplicate weight date.

## Completed in an earlier review (2026-10-27)

- [x] Add persistent AI handoff documentation (`AGENTS.md`, `PROJECT_CONTEXT.md`, `CHANGELOG.md`, `TODO.md`).
- [x] Add explicit setup-completion state and a migration path, plus visible setup errors.
- [x] Make default plan seeding resumable for partial onboarding.
- [x] Fix GitHub Pages asset and signup redirect base paths.
- [x] Fix previous-workout performance ordering.
- [x] Preserve an in-progress strength form across navigation/refresh in the same browser.
- [x] Add equipment metadata and exercise-to-equipment association in Settings.
- [x] Let calendar date actions open a strength or cardio entry prefilled with the selected date.
- [x] Replace the Vite starter favicon and harden `.env*` ignore rules.
- [x] `npm run typecheck` passes.
- [x] Run a clean `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, and `pnpm lint` on the target Mac runtime.
- [x] Make workout completion atomic and retry-safe through the `complete_workout` database function and upgrade migration.
- [x] Preserve the actual selected activity type when timing cycling, walking, or other cardio; it is no longer forced to treadmill.
