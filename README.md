# Gym Ledger

A responsive personal gym tracker built with React, TypeScript, Vite, Recharts, and Supabase. It is designed for GitHub Pages, so the frontend is static and needs no personal computer or server running after deployment.

The dashboard prioritises a 52-week GitHub-style activity heatmap. All activity scores, charts, trends, calories, volume, streaks, and records are calculated from saved account data. Empty accounts get empty states, not sample statistics.

## AI / developer handoff

Before changing this repository, read [AGENTS.md](AGENTS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [TODO.md](TODO.md), and the latest entry in [CHANGELOG.md](CHANGELOG.md). These files record the architecture, project constraints, known gaps, tests actually run, and the next steps. Inspect the source before trusting any note. Update the handoff files after each meaningful milestone.

## What is included

- Email registration, login, persistent sessions, logout, and account deletion through Supabase Auth.
- Cloud-backed, user-isolated entries for weight, food, cardio, gym profiles, equipment, exercises, routines, workout sessions, and individual sets.
- A responsive 52-week activity calendar with detail panel, period navigation, tooltips, rest-day handling, and configurable intensity scoring.
- Weight trends, calorie and macro logging, manual food entries, charts, editable goals, and CSV/JSON export.
- A refresh-safe treadmill/cardio timer. Its in-progress state is stored locally only to survive a browser interruption; a completed session is written to Supabase and updates the heatmap.
- Set-level strength logs, previous performance, personal records, estimated 1RM, volume reporting, rest timer, and an editable routine.
- Three dashboard rings for today (Asia/Kolkata): estimated exercise calories burned (with a goal and a red→green progress colour), calories consumed (food log plus a manual "Add calories" / "Set day's total"), and the estimated daily deficit or surplus against a configurable maintenance estimate. They roll over at midnight without a refresh; earlier days are kept.
- Cardio logging with three options: cycling (time, optional distance), treadmill (speed, incline and time) and walking (time, optional distance), by typing minutes or using a live timer. History shows each session's details and an estimated calorie burn.
- A database-backed workout lifecycle: one active workout per user, restored on refresh and across devices, with confirmed discard.
- A monthly report (Progress page): choose a month and year, download a readable Markdown report or structured JSON. See [docs/MONTHLY_REPORT_FORMAT.md](docs/MONTHLY_REPORT_FORMAT.md).
- Editable gym, equipment, and exercise libraries. Archiving equipment or exercises preserves historical workout records.

## Local development

Prerequisites: Node.js 22+ and pnpm 11+.

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   ```

2. Create the environment file. Do **not** put any service-role credential in it:

   ```bash
   cp .env.example .env
   ```

3. Add the project URL and public anon/publishable key from Supabase Project Settings → API.

4. Start the app:

   ```bash
   pnpm dev
   ```

5. Verify the production build before deployment:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   `pnpm test` compiles and runs the unit tests with Node's built-in runner (no extra dependencies).

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the application deliberately displays setup instructions. It does not silently fall back to an insecure local demo.

## Supabase setup

1. Create a new Supabase project.
2. In **Authentication → URL Configuration**, add your development URL (normally `http://localhost:5173`) and the final GitHub Pages URL, for example `https://YOUR-USER.github.io/YOUR-REPOSITORY/`.
3. For a new Supabase project, run [supabase/schema.sql](supabase/schema.sql) once, in full. If you already created a database from an earlier Gym Ledger version, run the applicable migrations in this order, each in full: [20261027_setup_completed.sql](supabase/migrations/20261027_setup_completed.sql), [20261027_atomic_workout_completion.sql](supabase/migrations/20261027_atomic_workout_completion.sql), [20261029_workout_lifecycle.sql](supabase/migrations/20261029_workout_lifecycle.sql), then [20261029_calorie_tracking.sql](supabase/migrations/20261029_calorie_tracking.sql). They are additive and safe to re-run. **The app does not apply migrations for you:** until the last two are run, the dashboard shows a "Database update needed" banner and the calorie/lifecycle features explain what is missing. Before running the lifecycle migration on a database with data, read "Legacy data" under *Workout lifecycle* in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md); afterwards, paste [supabase/tests/lifecycle_and_intake.test.sql](supabase/tests/lifecycle_and_intake.test.sql) into the SQL editor of a scratch project to check the database rules.
4. In **Authentication → Providers**, leave Email enabled. Configure email confirmation according to your preference. If confirmation remains enabled, a new user must verify their email before signing in.
5. Copy the Project URL and **anon/public publishable** key to `.env`.

The schema creates a profile on registration, constraints on all essential input ranges, indexes for dashboard queries, automatic update timestamps, and Row Level Security policies on every personal table. Each policy only permits rows whose user ID matches `auth.uid()`.

### Important security boundary

`VITE_*` values are compiled into a static frontend and therefore are public. Only put the Supabase project URL and anon/publishable key there. The service-role key bypasses RLS and must never appear in this repository, in GitHub Actions secrets for this frontend, or in browser code.

## GitHub Pages deployment

1. Push this project to GitHub on the `main` branch.
2. In GitHub, open **Settings → Pages** and set Source to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions**, add these repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push to `main` or run the **Deploy GitHub Pages** workflow manually.

The workflow at [.github/workflows/deploy.yml](.github/workflows/deploy.yml) sets `VITE_BASE_PATH` to `/<repository-name>/`, builds the app, and deploys `dist`. For a user/org Pages repository named `<owner>.github.io` or a root-mapped custom domain, use `/` as the base path instead of `/<repository-name>/` (and set the same value locally if you want to preview that path arrangement).

## Data model notes

- A workout plan is a future template. A `workout_session` is a historical record. Changing a plan does not rewrite completed sessions.
- Workouts contain individual `workout_sets`, retaining actual repetitions, load, duration, side, and completion state.
- Exercises and equipment use archival flags. They are not automatically deleted when a gym changes.
- Calendar intensity uses the profile JSON rules: completed strength session points + completed-set points + active cardio-minute points. The default thresholds are visible and editable in Settings.
- Dates are saved as `Asia/Kolkata` calendar dates and displayed in `Asia/Kolkata`, independent of the device's own time zone. The timer and workout sessions store UTC timestamps for their actual start/finish.
- Exercise calories and the daily balance are **estimates** (formulas and limits in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)). Strength calories come from session duration only, never from sets and reps. Calorie balance = estimated expenditure − calories consumed; it is not exercise minus food.
- A day with no food entries is "not recorded", not 0 kcal. The monthly report keeps that distinction.
- Environment variables are unchanged: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public values only), plus the optional `VITE_BASE_PATH` for Pages builds.

## Manual verification checklist

Run this against a configured Supabase project before relying on the tracker:

1. Register two different accounts and confirm each sees only its own records.
2. Add, edit, and delete one weight and food entry.
3. Start cardio, pause, refresh, resume, and finish; check that paused time is excluded and the heatmap changes.
4. Start a scheduled strength workout, record sets, complete it, and confirm previous performance appears the next time.
5. Add a gym, switch active gym, add a machine and a custom exercise, then add that exercise to a routine day.
6. Add/edit/delete activity and verify the selected heatmap day and summaries recalculate.
7. Test the dashboard and forms at a narrow mobile viewport.
8. Start a workout, refresh the page (it must come back), discard it (confirm dialog, then start a different routine). Start one on a second device and confirm both show the same session.
9. Add calories twice quickly and confirm one entry per tap; use *Set day's total* and confirm the food log is unchanged. Refresh and check another device shows the same totals.
10. Leave the dashboard open across midnight IST (or temporarily change the device clock) and confirm the rings reset to the new day without a reload and yesterday's records remain.
11. Download a monthly report for an empty month and a month with data; check that days without food entries appear as gaps, not zeros.
12. Log one cardio session of each kind (cycling, treadmill with speed and incline, walking). Start the live timer, refresh the page and confirm it is still running, then finish it. Edit a session's notes only and confirm its duration did not change.
13. Open the Nutrition page after using "Add calories" and confirm its "Consumed" figure matches the dashboard ring.

The 2026-10-27 source passed a clean install, TypeScript check, production build, and lint run on the target Mac. The 2026-10-31 calorie-ring / lifecycle changes have so far passed only the TypeScript check and the unit tests (`pnpm test`); `pnpm build`, `pnpm lint`, the new migrations, and all live Supabase behaviour (RLS, persistence, cross-device sync) still must be run and verified against your configured project. See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the exact verification status.

## Troubleshooting

- **“Connect your private data store” screen:** `.env` is missing, has placeholder values, or the development server was not restarted.
- **Login redirect fails on Pages:** add the exact deployed Pages URL to Supabase Authentication URL Configuration.
- **RLS error:** make sure the full schema was run and that the browser uses the anon/publishable key rather than a service-role key.
- **A registration is not immediately signed in:** email confirmation is enabled; verify the email then log in.
- **GitHub Pages shows a blank page:** confirm Pages uses GitHub Actions, workflow secrets exist, and `VITE_BASE_PATH` matches the repository path.
