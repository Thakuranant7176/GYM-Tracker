# Project TODO

Status is based on source inspection and tests available in the current review, not assumptions from an earlier completion message.

## P0 — Required before relying on the tracker

- [ ] Create/configure Supabase and run `supabase/schema.sql` for a new project (or apply reviewed migrations for an existing project).
- [ ] Test first registration and email confirmation; verify onboarding appears for the trigger-created profile.
- [ ] Verify onboarding creates the configured gym and all default workout plan/exercise links, including retry after an interrupted setup.
- [ ] Register two accounts and verify RLS prevents either user from reading or changing the other's records.
- [ ] Test CRUD for weight, nutrition, cardio, exercise/equipment, and workouts against the live cloud database.
- [ ] Test the cardio timer and active strength draft through pause, refresh, navigation, completion, and error cases.
- [ ] Deploy through GitHub Pages Actions and verify the site path, favicon, signup confirmation redirect, and Supabase allowed redirect URLs.

## P1 — Recommended polish

- [ ] Verify the dashboard heatmap visually at mobile and desktop widths with real saved entries.
- [ ] Test exports with empty and populated records; verify CSV contains enough labels to distinguish record types.
- [ ] Consider syncing unfinished strength-workout drafts to the cloud if cross-device recovery of an in-progress workout becomes a requirement; current draft recovery is local to the device/browser.

## Completed in the current review

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
