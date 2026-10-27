# Changelog

All dates use ISO format. Entries distinguish code changes from tests and external setup.

## 2026-10-27 — Archive review and onboarding/deployment fixes

### Added / changed
- Added `AGENTS.md`, `PROJECT_CONTEXT.md`, `CHANGELOG.md`, and `TODO.md` for persistent AI/developer handoff.
- Added `profiles.setup_completed` to the schema and a migration for projects using an earlier schema.
- Fixed onboarding detection: a profile row is created by the Supabase auth trigger, so profile existence alone must not skip setup. Setup now displays its validation/cloud errors and preserves the signup name when available.
- Made default-plan seeding resumable/idempotent by creating only missing exercises, plans, and plan-exercise links. Setup now marks itself complete only after seeding succeeds.
- Reused an existing gym if onboarding is retried after a partial failure.
- Validated setup's starting and target weight values against the database range.
- Made email-confirmation redirect use Vite's base path so GitHub Pages project sites can redirect back to the application route.
- Made the favicon URL base-aware for GitHub Pages project sites.
- Fixed previous-performance lookup to choose the latest earlier completed workout session instead of relying on the order in which sets happened to load.
- Stored the active strength-workout draft in browser storage so the in-progress set form can be recovered after a page refresh or navigation. Completed history remains cloud-backed.
- Added equipment metadata fields (manufacturer, model, settings, notes) to the settings form and allowed custom exercises to be associated with a machine/equipment item.
- Calendar date actions now offer separate strength/cardio logging actions and pass the selected date into the entry form/session instead of silently reverting to today. Restored cardio timers also restore their session date/type into the visible form.
- Changed the topbar indicator from “Synced” to “Cloud account” because the former could imply confirmed synchronization even after a failed load.
- Replaced the inherited Vite favicon with a simple sage-green Gym Ledger mark; removed unused Vite starter/social icon assets.
- Hardened `.gitignore` to ignore all `.env*` files while allowing `.env.example`.
- Updated README handoff and migration instructions.

### Validation
- `npm run typecheck`: passed after the changes.
- `npm run build`: could not run to completion in the review container because copied dependencies contain macOS ARM64 native bindings for Rolldown; the current environment is Linux and the Linux native binding is absent. Reinstall dependencies cleanly and run the build before deployment.
- `npm run lint`: blocked by the analogous missing Linux-native binding for Oxlint.
- Supabase integration, RLS behavior with multiple accounts, and GitHub Pages deployment: not tested; no credentials or Git repository were provided.

### Outstanding
- Run a clean install and full production build on the target Mac or GitHub Actions.
- Apply the schema/migration as appropriate and perform the manual cloud/security checklist in `README.md`.

## 2026-10-27 — Completion reliability pass

### Added / changed
- Added `complete_workout`, an authenticated SQL function that validates ownership, writes all workout sets, and marks the session completed in one transaction. It is idempotent for a retry after a successful but unacknowledged request.
- Added `supabase/migrations/20261027_atomic_workout_completion.sql` for existing databases; fresh installations receive the function from `schema.sql`.
- Updated the strength logger to use the atomic function rather than independent set/session writes.
- Fixed timed cardio so cycling, walking, and other-cardio sessions preserve the selected activity type instead of being reset to treadmill when the timer starts.
- Updated README, TODO, and project context with the migration order and current test evidence.

### Validation
- Clean `pnpm install --frozen-lockfile`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `pnpm lint`: passed with three non-blocking React-effect advisories.

### Outstanding
- Supabase authentication, real cloud writes, RLS isolation, and GitHub Pages deployment still require the user's configured project, credentials, and repository.

## 2026-10-27 — Mobile usability pass

### Added / changed
- Reworked phone breakpoints for 760 px and 390 px widths with safe-area padding, a usable drawer width, 44 px minimum controls, 16 px form text to prevent Safari zoom, and adaptive dashboard/action grids.
- Kept the 52-week heatmap and workout set table horizontally scrollable on a phone rather than compressing interactive cells and set inputs below usable widths.
- Made dense mobile areas wrap safely: calendar actions, timers, lists, routine controls, gym cards, export/delete actions, and long text labels.

### Validation
- `pnpm typecheck`, `pnpm build`, and `pnpm lint` passed after the CSS changes. Lint continues to report three non-blocking React-effect advisories.
