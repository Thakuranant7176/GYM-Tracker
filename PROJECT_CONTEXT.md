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
- All dates are `Asia/Kolkata` calendar dates, computed with fixed UTC+05:30 arithmetic that never consults the browser's time zone (see "Date and time handling").
- Do not fabricate workout, calorie, weight, or activity data.
- Changing a gym or archiving equipment/exercises must not erase history.

## Application map

- `src/App.tsx`: Main application, authentication screens, onboarding, dashboard heatmap, weight/nutrition/cardio/strength pages, progress and settings.
- `src/App.css`, `src/index.css`: responsive light-theme styling.
- `src/defaultPlan.ts`: initial Push A / Pull A / Cardio & Core / Push B / Pull B / Saturday Legs / Sunday Rest plan and muscle choices.
- `src/lib.ts`: Asia/Kolkata date helpers (`istDate`, `todayISO`, `addDays`, month helpers, `msUntilNextIstMidnight`), activity scoring, formatting, downloads, `newId`.
- `src/types.ts`: client-side record types.
- `src/calories.ts`: the single calorie engine — exercise estimates, daily intake, balance, ring colour/percent helpers, and the written methodology text. Pure functions; no React or Supabase.
- `src/CalorieDashboard.tsx`: the three dashboard rings (exercise burned, intake, balance), goal editing, and the Add/Set calorie form.
- `src/intake.ts`: validation of manual calorie entries and the retry/idempotency key tracker.
- `src/monthlyReport.ts`: builds the monthly report (JSON structure + Markdown rendering). Format is documented in `docs/MONTHLY_REPORT_FORMAT.md`.
- `src/workoutLifecycle.ts`: pure helpers for the database-authoritative workout lifecycle (active-session detection, stale-session description, draft storage).
- `src/midnight.ts` / `src/visibility.ts` / `src/hooks.ts`: the IST-midnight watcher and the visible-refresh (cross-device sync) watcher, both with injectable clocks and unit-tested, plus the thin React hooks `useToday` / `useVisibleRefresh` that subscribe to them.
- `src/dbErrors.ts`: recognises "migration not applied" database errors and names the migration file to run.
- `src/fetchAll.ts`: paginated reads (PostgREST returns at most 1,000 rows per request).
- `src/cardioForm.ts`: the three cardio options (cycling, treadmill, walking), which fields each requires, validation that mirrors the database limits, and the display helpers. `src/foodForm.ts`: validation for the food form. `src/numbers.ts`: the shared, strict decimal parser (`parseDecimal`).
- `tests/*.test.ts(x)`, `tsconfig.test.json`, `scripts/*.mjs`: unit tests and server-render tests (Node's built-in runner, no extra dependencies; `pnpm test`). The render tests draw the real screens with fixture data, with Supabase and CSS stubbed by `scripts/extensionless-hooks.mjs`.
- `supabase/tests/lifecycle_and_intake.test.sql`: database/RLS checks to run by hand in Supabase (not yet executed; see TODO).
- `src/supabase.ts`: reads public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no service-role key belongs in the browser.
- `supabase/schema.sql`: schema for new projects, triggers, RLS policies, and account deletion function.
- `supabase/migrations/20261027_setup_completed.sql`: migration for an existing schema to add the onboarding-completion marker.
- `supabase/migrations/20261027_atomic_workout_completion.sql`: migration that adds an atomic, idempotent workout-completion function.
- `supabase/migrations/20261029_workout_lifecycle.sql`: adds `workout_sessions.status` (`in_progress` / `completed` / `discarded`) with start/complete timestamps, a one-active-session-per-user unique index, a transition-guard trigger, and the `start_workout`, `complete_workout` (replaced) and `discard_workout` functions.
- `supabase/migrations/20261029_calorie_tracking.sql`: adds calorie goal columns to `profiles`, the `calorie_intake_entries` table (RLS), and `set_daily_intake_total`.
- `.github/workflows/deploy.yml`: GitHub Pages build/deploy workflow.
- `.env.example`: public browser configuration template only. `.gitignore` excludes local `.env*` files while explicitly allowing this example file.

## Data and persistence

The cloud database is authoritative for completed records. Tables include `profiles`, `gym_profiles`, `equipment`, `exercises`, `workout_plans`, `plan_exercises`, `workout_sessions`, `workout_sets`, `weight_entries`, `food_entries`, and `cardio_sessions`. Personal records include `user_id` and RLS policies compare that identifier to `auth.uid()`; profiles use `id = auth.uid()`.

Local browser storage is used for the in-progress cardio timer and for the typed-in set values (a *draft*) of the active strength workout. The draft is keyed by the id of the session the **database** reports as active and is ignored for any other session; it never decides which workout is active. Calendar date actions can prefill strength/cardio logging for the selected historical date. Completed records are written to Supabase. The cardio timer's current timer state is not a substitute for a completed cloud record.

New users receive a profile from `handle_new_user()` on registration. Therefore profile existence alone is not evidence that first-time setup is complete. `profiles.setup_completed` is the explicit onboarding marker. Onboarding creates or reuses a gym, idempotently seeds missing default exercises/plans/plan-exercises, and only then sets the marker to true. Completed workouts are persisted through the `complete_workout` SQL function in one transaction; a retry after an uncertain network response does not duplicate set rows.

## Workout lifecycle (database-authoritative)

`workout_sessions.status` is `in_progress`, `completed` or `discarded`; the last two are terminal (a trigger rejects any other transition). A planned workout is only a `workout_plans` row; it becomes a session when started.

- **One active session per user:** a unique partial index (`workout_sessions_one_active_per_user`) makes a second `in_progress` row impossible, however it is inserted.
- **Start:** `start_workout(plan, date, title)` returns the existing active session if there is one (double tap, retry, second device), otherwise creates it. Concurrent starts are serialised per user. A future date is refused; a past date (calendar "log for 12 Oct") is allowed.
- **Complete:** `complete_workout(session, notes, sets)` works only on an `in_progress` session, writes the sets and the status in one transaction, is a no-op on a session that is already completed, and refuses a discarded one. Duration is derived on the server from `started_at`; a session left open for more than 4 hours stores a NULL duration (unknown) rather than a misleading figure.
- **Discard:** `discard_workout(session)` marks an unfinished session `discarded` (the row is kept, excluded from every total, and its slot is freed). It is idempotent and refuses to touch a completed workout. The UI asks for confirmation first.
- **Client:** `WorkoutPage` derives the active session from the loaded rows (`findActiveSession`); there is no browser-held "active" state to drift. Silent refreshes (tab focus, reconnect, every 5 minutes, midnight) reconcile it, so a session finished or discarded on another device disappears here with an explanatory message. A session still open from an earlier day, or open for 6+ hours, shows a banner telling the user to complete or discard it. Nothing about midnight rewrites a session.
- **Failures:** success is reported only after the database confirms; on any error the session stays active exactly as it was.
- **Legacy data (migration):** completed rows get `status = 'completed'`. Per user, the newest unfinished row created in the last 24 hours becomes `in_progress`; every other unfinished row becomes `discarded` (kept, not deleted). Rows that somehow share `in_progress` keep only the newest. A trigger lets an older client that only writes the boolean `completed` keep working.
- **Before applying to a live database**, count unfinished legacy rows per user to know what the backfill will touch: `select user_id, count(*) from workout_sessions where completed = false group by 1;`

## Cardio logging

One form with three options (`src/cardioForm.ts`, used by `CardioPage`):

| Option | Required | Optional |
| --- | --- | --- |
| Cycling | time (minutes) | distance (km) |
| Treadmill | speed (km/h, 0.5–25), incline (%, 0–40; 0 for flat) and time | — |
| Walking | time (minutes) | distance (km) |

- **Time** is typed in minutes (1–720) or supplied by the live timer (runs through a refresh; paused time is not counted; asks before saving a timer over 4 hours). The date cannot be in the future.
- **Retry-safe:** a new session is inserted with a client-generated id and `ON CONFLICT DO NOTHING` (the timer keeps its id across refreshes), so a double tap or a retry after a lost response cannot create two rows.
- **Editing** never rewrites what you did not change: the duration is only updated if the minutes field changed, `paused_seconds`, start time, heart rate and machine calories are never touched, and details that no longer apply are cleared only when you change the activity.
- Distances that imply an impossible speed (over 60 km/h cycling, over 25 km/h on foot) are rejected, and a comma decimal (`6,5`) is accepted while `1,000` is rejected as ambiguous.
- History shows each session's recorded details and an estimated calorie burn (hover for the method). Older "other cardio" records keep their label and can still be edited or re-classified.

## Calorie model (all exercise and balance numbers are estimates)

Everything lives in `src/calories.ts`; the dashboard, the monthly report and the tests call the same functions.

- **Active (net) exercise calories** = (MET − 1) × 3.5 × body weight (kg) ÷ 200 per minute. Resting energy is already inside maintenance, so it is not counted again.
- **Treadmill:** ACSM walking equation up to 8 km/h, running equation above, from recorded speed (or distance ÷ time) and incline. Neither recorded → fixed 5 MET, labelled "assumed intensity". Speeds over 25 km/h are rejected as data errors.
- **Cycling:** with a recorded distance (or speed) the Compendium of Physical Activities MET for that average speed (4.0 under 16 km/h, 6.8 to 19 km/h, 8.0 to 22.5, 10.0 to 25.7, 12.0 to 32, 15.8 above; over 60 km/h is rejected as a data error); time only → fixed 6.8 MET, labelled "assumed intensity". **Walking:** with a distance (or speed, and incline if an older record has one) the ACSM equation at that speed; time only → fixed 3.5 MET, "assumed intensity". **Other** cardio (older records only) uses a machine-reported calorie value if entered, otherwise it is "unavailable".
- **Strength** 3.5 MET for the session duration, only when the completed session has a reliable duration. Sets/reps/loads are never converted to calories.
- **Body weight:** latest weigh-in on or before the day; else the starting weight (flagged); else no estimate.
- **No double counting:** each completed session and each cardio record is estimated once (never per set); rows with the same id count once; strength time overlapping recorded cardio intervals (merged first) is subtracted; discarded and in-progress sessions never count.
- **Intake** = detailed food entries + manual quick-add entries (`calorie_intake_entries`). A day with neither is *not recorded* (null), which differs from a recorded 0 (a "set total = 0" stores a 0 row).
- **Add vs Set:** *Add* inserts an append-only entry (client-generated id; a retry or double tap is ignored by `ON CONFLICT DO NOTHING`). *Set* makes the day's total intake exactly the entered number: the food log is kept, earlier quick-adds for the day are replaced by one row holding the difference, and it is refused if the food log already exceeds the number.
- **Balance** = estimated expenditure − intake. Expenditure = the configured maintenance estimate, plus logged exercise **only** when `maintenance_includes_exercise` is false. Positive = deficit, negative = surplus. The target is signed (positive deficit goal, negative surplus goal). No maintenance estimate or no intake → balance unavailable; nothing is assumed in its place. Exercise is never subtracted from food. For *today* the balance compares intake so far with a full day's expenditure; the UI says so.
- **Ring colours:** the exercise ring is red < 25%, orange 25–49, yellow 50–74, light green 75–99, green ≥ 100. Percent labels are floored so text and colour always agree. The intake ring is neutral (amber when over goal); the balance ring is sage/green toward the target and red when moving the other way.

## Date and time handling

- A "day" is an `Asia/Kolkata` calendar date. India has no DST, so IST is a fixed UTC+05:30 offset and `lib.ts` does all date maths in UTC milliseconds without touching the browser time zone. A device set to another zone still reports the same day (unit-tested).
- Storage: `entry_date` / `session_date` are `date` columns holding the IST date chosen when the record was created; `created_at`, `started_at`, `completed_at`, `discarded_at` are `timestamptz` (UTC). The database uses `(now() at time zone 'Asia/Kolkata')::date` for server-side "today".
- **Midnight rollover:** `useToday()` (backed by the tested `watchIstDay`) arms one timer for the next IST midnight and re-checks on tab visibility/focus (a sleeping device can skip timers). On a new day the Dashboard remounts (`key={today}`), the rings switch to the new date, and a silent data refresh runs so all devices agree. Cleanup removes the timer and both listeners. Nothing is deleted or reset: goals and every earlier day remain.
- **Sessions crossing midnight** keep their real `started_at` / `completed_at`. All of a session's metrics (calories, volume, report) go to its `session_date`, the IST date it **started**. A cardio timer captures its date when it starts.
- `session_date` for a new strength session is resolved when the workout is started (explicit calendar date, else the current IST date), so a page left open overnight never files work under yesterday.

## Running locally

1. Install Node.js 22+ and pnpm (the README/workflow currently request pnpm 11+).
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env`.
4. Configure a Supabase project URL and public anon/publishable key in `.env`.
5. For a new Supabase project, run `supabase/schema.sql` in the SQL editor. For a database created from an earlier version, run the applicable migration in `supabase/migrations/` after checking your current schema.
6. Apply migrations in this order for an existing database: `20261027_setup_completed.sql`, `20261027_atomic_workout_completion.sql`, `20261029_workout_lifecycle.sql`, `20261029_calorie_tracking.sql`. A fresh project only needs `schema.sql`.
7. Run `pnpm dev`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
8. Until a migration is applied the app still loads and shows a "Database update needed" banner naming the missing file, and the affected controls explain what to run. Manual calories and the new goals need `20261029_calorie_tracking.sql`. **Starting a strength workout needs `20261029_workout_lifecycle.sql`**, because workouts are now started through the `start_workout` function; weight, food, cardio, history and reports keep working either way.

## Deployment notes

The repository contains a GitHub Pages workflow (below). The owner has also reported the production site as `https://gym-tracker-jade-eta.vercel.app` on Vercel; no Vercel configuration is in the repository and the live deployment was not inspected, so which host is current is unverified. Nothing in this work was pushed or deployed.

## GitHub Pages notes

- The workflow sets `VITE_BASE_PATH` to `/<repository-name>/` for a standard project site.
- If using a user/org Pages repository (`<owner>.github.io`) or a root-mapped custom domain, the base path must be `/`.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub Actions repository secrets. These are public frontend settings when compiled; never store a service-role key in the frontend workflow.
- Supabase Auth URL Configuration must allow the exact deployed app URL, including the repository path.
- HTML assets and email-confirmation redirects must respect Vite's `BASE_URL` for project sites.

## Verified state (2026-10-31, calorie rings / lifecycle work)

- **Ran and passed:** `tsc -b` (the project's typecheck) exits 0; `pnpm test` runs 149 tests, all passing: dates/time zone, calorie formulas and rounding, missing-vs-zero, double-counting, cardio option validation, food/number parsing, intake validation and retry keys, midnight and visible-refresh watchers (timers and listeners), workout lifecycle helpers and drafts, monthly report contents and user-data boundaries, and server-rendered screens (cardio, nutrition, day detail, rings, workout, dashboard, progress). The render tests were mutation-checked: deliberately reverting each fix made them fail.
- **Not run (sandbox limits):** `pnpm build` and `pnpm lint` — the copied dependencies contain macOS ARM64 native bindings and the sandbox is Linux without network. Run them on the Mac.
- **Never executed:** both new migrations, the SQL functions/trigger/index, and RLS for the new table. No Postgres engine or Supabase credentials were available. `supabase/tests/lifecycle_and_intake.test.sql` is written to check them and must be run in a scratch Supabase project.
- **Not tested in a browser:** the rings' and cardio options' layout at 3/2/1 columns, clicks and typing, the live midnight rollover, cross-device refresh, and every form against a real database. The render tests only draw each screen once from fixture data. Live Supabase persistence/synchronisation is therefore **unverified**.
- The inherited uncommitted work did not compile (a missing brace in `App.tsx`, undeclared names, null-safety errors) and its client code called database objects that no SQL file created; both were repaired/replaced. `App.tsx` was also reformatted wholesale by the previous AI (about 3,900 lines, was ~360 very long lines, with quote/semicolon/comma changes throughout), so a plain, `-w` or word diff against `cc5336b` is not reviewable. Review it by feature (see the CHANGELOG list of what changed in `App.tsx`), or run the same formatter over the `cc5336b` version first and diff that.

## Verified state at handoff review (2026-10-27)

- The uploaded source archive included source files, SQL, workflow, README, `dist/`, and `node_modules/`; it did not include a `.git` directory or a real Supabase configuration.
- A clean `pnpm install --frozen-lockfile`, `pnpm typecheck`, production build, and `pnpm lint` all passed on the target Mac runtime on 2026-10-27. Oxlint emitted three non-blocking React-effect advisories, but returned a successful status; no build or type error remains.
- Supabase authentication, actual cloud writes, RLS isolation, timer behavior in a live browser, and GitHub Pages deployment have not been tested here because no Supabase credentials or Git repository were supplied.

## Known limitations / next checks

See `TODO.md`. The most important remaining verification is to perform a clean dependency install on the target Mac or GitHub Actions, then test a new user through onboarding and run the README cloud/security checklist.
