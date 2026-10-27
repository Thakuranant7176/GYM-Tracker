# Gym Ledger — Project Context

## Purpose

Gym Ledger is a private personal fitness tracker for use on a MacBook and Android phone. The primary dashboard feature is a GitHub-style 52-week activity heatmap using five muted green levels. Other features track strength training, treadmill/cardio, body weight, nutrition, gym profiles, equipment, and custom exercises.

## Technology

- React 19 + TypeScript
- Vite 8 and `@vitejs/plugin-react`
- Recharts for line/bar charts
- Lucide React for icons
- Supabase JS client for authentication and database access
- Supabase PostgreSQL schema with row-level security
- GitHub Actions / GitHub Pages for static hosting
- pnpm lockfile (`pnpm-lock.yaml`, lockfile format 9)

## Design and product constraints

- Light, minimal theme: warm off-white background (`#F8F7F4`), white surfaces, muted sage (`#8DAA91`), pale lavender/blue accents, charcoal text.
- Compact layouts activate at 960 px so phones that report a wide CSS viewport still receive the drawer navigation and single-column presentation. They prioritise touch targets and controlled horizontal scrolling for the 52-week heatmap and dense workout-set table; they do not squeeze those controls into unusable columns.
- Dashboard heatmap is the main screen, not a secondary chart.
- Saturday is the default leg day; Sunday is rest.
- Dates are intended to be handled in `Asia/Kolkata`.
- Do not fabricate workout, calorie, weight, or activity data.
- Changing a gym or archiving equipment/exercises must not erase history.

## Application map

- `src/App.tsx`: Main application, authentication screens, onboarding, dashboard heatmap, weight/nutrition/cardio/strength pages, progress and settings.
- `src/App.css`, `src/index.css`: responsive light-theme styling.
- `src/defaultPlan.ts`: initial Push A / Pull A / Cardio & Core / Push B / Pull B / Saturday Legs / Sunday Rest plan and muscle choices.
- `src/lib.ts`: date helpers, activity scoring, formatting and downloads.
- `src/types.ts`: client-side record types.
- `src/supabase.ts`: reads public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no service-role key belongs in the browser.
- `supabase/schema.sql`: schema for new projects, triggers, RLS policies, and account deletion function.
- `supabase/migrations/20261027_setup_completed.sql`: migration for an existing schema to add the onboarding-completion marker.
- `supabase/migrations/20261027_atomic_workout_completion.sql`: migration that adds an atomic, idempotent workout-completion function.
- `.github/workflows/deploy.yml`: GitHub Pages build/deploy workflow.
- `.env.example`: public browser configuration template only. `.gitignore` excludes local `.env*` files while explicitly allowing this example file.

## Data and persistence

The cloud database is authoritative for completed records. Tables include `profiles`, `gym_profiles`, `equipment`, `exercises`, `workout_plans`, `plan_exercises`, `workout_sessions`, `workout_sets`, `weight_entries`, `food_entries`, and `cardio_sessions`. Personal records include `user_id` and RLS policies compare that identifier to `auth.uid()`; profiles use `id = auth.uid()`.

Local browser storage is used for the in-progress cardio timer and the in-progress strength-workout draft so it can be restored after navigation or a refresh on the same browser/device. Calendar date actions can prefill strength/cardio logging for the selected historical date. Completed records are written to Supabase. The cardio timer's current timer state is not a substitute for a completed cloud record.

New users receive a profile from `handle_new_user()` on registration. Therefore profile existence alone is not evidence that first-time setup is complete. `profiles.setup_completed` is the explicit onboarding marker. Onboarding creates or reuses a gym, idempotently seeds missing default exercises/plans/plan-exercises, and only then sets the marker to true. Completed workouts are persisted through the `complete_workout` SQL function in one transaction; a retry after an uncertain network response does not duplicate set rows.

## Running locally

1. Install Node.js 22+ and pnpm (the README/workflow currently request pnpm 11+).
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env`.
4. Configure a Supabase project URL and public anon/publishable key in `.env`.
5. For a new Supabase project, run `supabase/schema.sql` in the SQL editor. For a database created from an earlier version, run the applicable migration in `supabase/migrations/` after checking your current schema.
6. Run `pnpm dev`, `pnpm typecheck`, and `pnpm build`.

## GitHub Pages notes

- The workflow sets `VITE_BASE_PATH` to `/<repository-name>/` for a standard project site.
- If using a user/org Pages repository (`<owner>.github.io`) or a root-mapped custom domain, the base path must be `/`.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub Actions repository secrets. These are public frontend settings when compiled; never store a service-role key in the frontend workflow.
- Supabase Auth URL Configuration must allow the exact deployed app URL, including the repository path.
- HTML assets and email-confirmation redirects must respect Vite's `BASE_URL` for project sites.

## Verified state at handoff review

- The uploaded source archive included source files, SQL, workflow, README, `dist/`, and `node_modules/`; it did not include a `.git` directory or a real Supabase configuration.
- A clean `pnpm install --frozen-lockfile`, `pnpm typecheck`, production build, and `pnpm lint` all passed on the target Mac runtime on 2026-10-27. Oxlint emitted three non-blocking React-effect advisories, but returned a successful status; no build or type error remains.
- Supabase authentication, actual cloud writes, RLS isolation, timer behavior in a live browser, and GitHub Pages deployment have not been tested here because no Supabase credentials or Git repository were supplied.

## Known limitations / next checks

See `TODO.md`. The most important remaining verification is to perform a clean dependency install on the target Mac or GitHub Actions, then test a new user through onboarding and run the README cloud/security checklist.
