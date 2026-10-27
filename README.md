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
   pnpm build
   ```

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the application deliberately displays setup instructions. It does not silently fall back to an insecure local demo.

## Supabase setup

1. Create a new Supabase project.
2. In **Authentication → URL Configuration**, add your development URL (normally `http://localhost:5173`) and the final GitHub Pages URL, for example `https://YOUR-USER.github.io/YOUR-REPOSITORY/`.
3. For a new Supabase project, run [supabase/schema.sql](supabase/schema.sql) once, in full. If you already created a database from an earlier Gym Ledger version, run the applicable migrations in date order: first [20261027_setup_completed.sql](supabase/migrations/20261027_setup_completed.sql), then [20261027_atomic_workout_completion.sql](supabase/migrations/20261027_atomic_workout_completion.sql).
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
- Dates are saved as calendar dates and displayed in `Asia/Kolkata`. The timer stores ISO timestamps for its active interval.

## Manual verification checklist

Run this against a configured Supabase project before relying on the tracker:

1. Register two different accounts and confirm each sees only its own records.
2. Add, edit, and delete one weight and food entry.
3. Start cardio, pause, refresh, resume, and finish; check that paused time is excluded and the heatmap changes.
4. Start a scheduled strength workout, record sets, complete it, and confirm previous performance appears the next time.
5. Add a gym, switch active gym, add a machine and a custom exercise, then add that exercise to a routine day.
6. Add/edit/delete activity and verify the selected heatmap day and summaries recalculate.
7. Test the dashboard and forms at a narrow mobile viewport.

This updated source has passed a clean `pnpm install --frozen-lockfile`, TypeScript check, production build, and lint run on the target Mac. Supabase authentication, cloud mutations, and user-isolation behavior still must be verified against your configured project. See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the exact verification status.

## Troubleshooting

- **“Connect your private data store” screen:** `.env` is missing, has placeholder values, or the development server was not restarted.
- **Login redirect fails on Pages:** add the exact deployed Pages URL to Supabase Authentication URL Configuration.
- **RLS error:** make sure the full schema was run and that the browser uses the anon/publishable key rather than a service-role key.
- **A registration is not immediately signed in:** email confirmation is enabled; verify the email then log in.
- **GitHub Pages shows a blank page:** confirm Pages uses GitHub Actions, workflow secrets exist, and `VITE_BASE_PATH` matches the repository path.
