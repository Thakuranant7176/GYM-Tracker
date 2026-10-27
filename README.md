# Gym Ledger — Personal Gym Tracker

A responsive, cloud-backed personal fitness tracker built with **React, TypeScript, Vite, Recharts, and Supabase**. Gym Ledger helps track strength training, cardio, nutrition, body weight, workout consistency, and personal progress from desktop or mobile browsers.

The application uses a static frontend hosted on Vercel and Supabase for authentication and cloud data storage. Once deployed, it does not require a personal computer or local server to remain running.

**Production URL:** https://gym-tracker-jade-eta.vercel.app

**GitHub repository:** https://github.com/Thakuranant7176/GYM-Tracker

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Hosting and Deployment](#hosting-and-deployment)
- [Mobile Responsiveness](#mobile-responsiveness)
- [Supabase Configuration](#supabase-configuration)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Database and Data Model](#database-and-data-model)
- [Security](#security)
- [Git Workflow](#git-workflow)
- [Testing and Verification](#testing-and-verification)
- [Troubleshooting](#troubleshooting)
- [Future Development and AI Handoff](#future-development-and-ai-handoff)

---

## Features

### 1. Dashboard

- Personal fitness overview and daily workout plan.
- 52-week GitHub-style activity heatmap.
- Daily activity summaries and consistency tracking.
- Cardio statistics and workout progress.
- Navigation to strength, cardio, nutrition, weight, progress, and settings.
- Empty states for accounts without recorded activity instead of fabricated statistics.

Activity scores, charts, trends, workout volume, streaks, and personal records are calculated from saved account data.

### 2. Strength Training

- Record individual exercises and sets.
- Save repetitions, weight, duration, side, and completion status where applicable.
- Review previous performance.
- Track personal records and estimated one-repetition maximum (1RM).
- Calculate workout volume.
- Use a rest timer.
- Create and edit workout routines.
- Start scheduled workouts and save completed sessions.

### 3. Cardio Tracking

- Record treadmill sessions and other cardio activities.
- Use a timer that survives browser refreshes and interruptions.
- Pause and resume an active session.
- Exclude paused time from the completed duration.
- Save completed cardio sessions to Supabase.
- Update the activity heatmap from recorded cardio activity.

The active timer state is stored locally to survive interruptions. Completed workout records are stored in Supabase.

### 4. Weight Tracking

- Record body weight over time.
- View weight trends and charts.
- Monitor progress toward weight goals.
- Review historical entries.

### 5. Nutrition Tracking

- Record food entries and calories.
- Track macronutrients.
- Add foods manually.
- Edit nutrition goals.
- Review nutrition summaries and charts.

### 6. Activity Calendar

- View activity across 52 weeks.
- Navigate between periods and inspect individual dates.
- Review daily activity details.
- Handle rest days.
- Configure activity intensity scoring.
- Calculate activity from completed strength sessions, completed sets, and active cardio minutes.

The heatmap reflects actual saved activity, not random or sample data.

### 7. Gym and Exercise Management

- Add and manage gym profiles.
- Switch between gyms.
- Manage gym equipment and machines.
- Add custom exercises.
- Edit workout routines.
- Archive equipment and exercises while preserving historical workout records.

### 8. Data Management

- Export supported data in CSV and JSON formats.
- Edit and delete supported records.
- Delete an account through the application's account-management functionality.
- Keep personal records isolated between authenticated users using Supabase Row Level Security (RLS).

### 9. Mobile Access

- Access the application from a phone's web browser.
- Log strength sets and cardio sessions at the gym.
- Review workout history and progress.
- Use responsive navigation and touch-friendly controls.

No separate native Android or iOS application is required.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Component-based user interface |
| TypeScript | Type safety and maintainable application code |
| Vite | Development server and production build tooling |
| Recharts | Charts and fitness data visualizations |
| Supabase Auth | Registration, login, sessions, and authentication |
| Supabase PostgreSQL | Persistent cloud database |
| Supabase Row Level Security | User-level data access protection |
| CSS | Responsive styling and layouts |
| pnpm | Package management |
| Git and GitHub | Version control and source hosting |
| Vercel | Production frontend hosting and deployment |

### Why this stack?

- React and TypeScript support a maintainable, interactive interface.
- Vite provides a fast development workflow and optimized production builds.
- Supabase provides managed authentication and PostgreSQL without requiring a self-hosted backend server.
- Vercel serves the frontend and integrates with GitHub for deployments.
- Recharts makes it possible to visualize weight, nutrition, and training progress.

---

## Architecture

Gym Ledger uses a static frontend with a managed cloud backend.

```text
Phone / Desktop Browser
          |
          v
 React + TypeScript + Vite
          |
          v
 Supabase Client Library
          |
          v
 Supabase Authentication
          |
          v
 PostgreSQL Database
          |
          v
 Row Level Security Policies
```

The production frontend is hosted on Vercel. Supabase handles authentication and persistent personal data.

The browser communicates directly with Supabase through its client library. The application does not require a continuously running personal computer or custom application server for normal use.

### Important distinction

The frontend is hosted on Vercel, while Supabase is responsible for authentication and cloud data. These are separate services and must both be configured correctly.

---

## Hosting and Deployment

### Current production hosting

- **Hosting provider:** Vercel
- **Project name:** `gym-tracker`
- **Production URL:** https://gym-tracker-jade-eta.vercel.app
- **Source repository:** `Thakuranant7176/GYM-Tracker`
- **Frontend framework:** Vite
- **Backend and database:** Supabase

The project has had successful Vercel deployments, including a deployment associated with the mobile layout breakpoint fix, commit `cc5336b`.

The Vercel dashboard has shown production deployments from both `main` and `gym` at different points. Confirm the current production branch in Vercel before assuming that every push to either branch updates the production site.

### How automatic deployment works

1. Make changes to the application.
2. Run the relevant local checks.
3. Commit and push changes to GitHub.
4. Vercel detects a push to a configured deployment branch.
5. Vercel installs dependencies and builds the application.
6. Vercel publishes the new deployment if the build succeeds.
7. Test the deployed application, especially authentication and mobile layouts.

### Vercel deployment settings

In the Vercel dashboard, open the `gym-tracker` project and inspect:

- **Git:** connected GitHub repository and production branch.
- **Build and Development Settings:** Vite framework, build command, and output directory.
- **Environment Variables:** Supabase URL and public key.
- **Deployments:** current production deployment and build logs.

Expected build settings for this Vite project are generally:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Root directory | Repository root (`./`) |

Confirm these settings against the current repository and lockfile before changing them.

### Environment variables on Vercel

Configure these variables in **Project Settings → Environment Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the actual Supabase project URL and public anon/publishable key.

Apply the variables to the Production environment and Preview if those environments need to connect to the configured Supabase project. Redeploy after changing environment variables.

Do not add a Supabase service-role key to the frontend.

### GitHub Pages history

GitHub Pages was previously configured as an alternative deployment route. A GitHub Actions workflow using `actions/deploy-pages@v4` failed with an HTTP 404 while creating a Pages deployment. The repository was subsequently made public, but a successful GitHub Pages deployment has not been established by that failure log alone.

The current documented production host is Vercel. Treat GitHub Pages as inactive unless its repository settings and a successful deployment run confirm otherwise.

The existing workflow file is `.github/workflows/deploy.yml`. Inspect it before using or modifying the GitHub Pages deployment process.

---

## Mobile Responsiveness

Mobile usability is important because workouts are recorded while using a phone at the gym.

### Mobile layout changes

The mobile layout was adjusted to address a breakpoint issue. The previous compact layout activated only below 760 CSS pixels, while an older phone reported an effective CSS viewport of approximately 800 pixels. As a result, the desktop sidebar remained visible and compressed the dashboard.

The mobile layout breakpoint was expanded to 960 pixels.

Other reported changes include:

- Improved navigation and drawer width.
- Safer padding for narrow screens and device safe areas.
- Touch targets with a minimum size of approximately 44 pixels.
- Form text of at least 16 pixels to reduce unwanted browser zoom on mobile Safari.
- Horizontally scrollable heatmaps and dense workout tables.
- More flexible wrapping for timers, calendar actions, gym cards, lists, routine controls, and long labels.

### Mobile verification

The application initially remained broken on an older Redmi Note 5 Pro after deployment, while a newer phone displayed it correctly. It subsequently appeared to work correctly.

This is an observed compatibility history, not proof that every mobile browser and device has been tested.

When changing responsive CSS, test:

- A viewport around 360–390 CSS pixels.
- A viewport around 760–800 CSS pixels.
- A wider tablet viewport.
- Navigation, forms, heatmap, strength logging, cardio timer, and settings.
- Both portrait and landscape orientation where relevant.

Use browser developer tools to inspect the actual CSS viewport rather than relying only on the phone's physical screen resolution.

---

## Supabase Configuration

Supabase provides authentication and persistent storage.

### Project configuration

Open the Supabase dashboard for the configured project.

The project URL used during setup was:

`https://sytmnxqfpdmragzkzchy.supabase.co`

Verify that this remains the correct project URL before using it in any new environment.

### Initial database setup

For a new database:

1. Open the Supabase SQL Editor.
2. Open `supabase/schema.sql` from the repository.
3. Review the SQL and execute the complete schema once.

For an existing database created by an earlier Gym Ledger version, inspect the migration history before running additional migrations. The project documentation identifies these migrations:

1. `supabase/migrations/20261027_setup_completed.sql`
2. `supabase/migrations/20261027_atomic_workout_completion.sql`

Apply only migrations that have not already been applied, in the documented order. Do not rerun schema creation or migrations blindly against a populated database.

### Authentication URL configuration

In Supabase, open **Authentication → URL Configuration**.

Configure the site URL and allowed redirect URLs to match the actual production URL and any local development URLs.

For local development, the usual URL is:

`http://localhost:5173`

For production, use:

`https://gym-tracker-jade-eta.vercel.app`

Add preview URLs only if the application needs to redirect authentication flows to those deployments. Keep the configured URLs aligned with the actual application origins.

### Authentication settings

- Email authentication is used for registration and login.
- Email confirmation behavior depends on the Supabase project settings.
- If email confirmation is enabled, a newly registered user may need to verify their email before signing in.
- Persistent sessions are handled through Supabase Auth.

### Database security

The schema includes user profiles, constraints on essential input ranges, indexes, update timestamps, and Row Level Security policies on personal tables.

Policies are intended to restrict access to records belonging to the authenticated user using `auth.uid()`.

The schema and policies must be inspected and tested against the actual Supabase database before relying on them for privacy guarantees.

---

## Environment Variables

Create a local environment file from the example:

```bash
cp .env.example .env
```

Expected frontend variables:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

Replace the placeholders with the values from Supabase.

The application uses these variables at build time. If the variables are missing or contain placeholders, the application is designed to show setup instructions rather than silently falling back to an insecure local demo.

After changing environment variables, restart the local development server or rebuild and redeploy the production application.

### Security rules

- Never commit `.env` files containing credentials.
- Never expose a Supabase service-role key in frontend code.
- Never use the service-role key as a Vite environment variable.
- The project URL and anon/publishable key are intended for browser use, but they are not substitutes for correctly configured RLS policies.
- Keep the `.env.example` file limited to variable names and safe placeholders.

---

## Local Development

### Prerequisites

- Node.js 22 or a compatible supported version.
- pnpm 11 or a compatible version required by the project.
- Git.
- A configured Supabase project for real authentication and cloud data.

Check the installed versions:

```bash
node --version
pnpm --version
git --version
```

### 1. Clone the repository

```bash
git clone https://github.com/Thakuranant7176/GYM-Tracker.git
cd GYM-Tracker
```

### 2. Install dependencies

```bash
pnpm install --frozen-lockfile
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and enter the correct Supabase URL and public anon/publishable key.

### 4. Start the development server

```bash
pnpm dev
```

Vite will print the local development URL, normally:

`http://localhost:5173`

### 5. Validate the application

```bash
pnpm typecheck
pnpm build
pnpm lint
```

Resolve relevant failures before pushing changes.

### 6. Preview the production build

```bash
pnpm preview
```

Use the URL printed by Vite to inspect the built application locally.

---

## Database and Data Model

The project distinguishes planned workouts from completed historical sessions.

- **Profile:** user-specific settings and activity scoring configuration.
- **Weight entries:** dated body-weight measurements.
- **Food entries:** nutrition and macronutrient records.
- **Cardio entries:** completed cardio sessions and duration.
- **Gym profiles:** user-managed gyms and active gym selection.
- **Equipment:** machines and equipment associated with gyms.
- **Exercises:** built-in and custom exercise definitions.
- **Routines:** reusable workout plans and scheduled exercises.
- **Workout sessions:** historical workout records.
- **Workout sets:** individual completed or in-progress sets with actual performance data.

### Data integrity principles

- Workout plans represent future templates; completed sessions represent history.
- Editing a routine must not rewrite historical workout records.
- Archiving an exercise or equipment item should preserve its historical references.
- Completed cardio and strength activities contribute to the activity heatmap.
- Calendar dates are displayed in `Asia/Kolkata`.
- The active cardio timer uses ISO timestamps to track its active interval.
- Atomic workout completion behavior is supported by a documented database migration; verify the deployed schema and client code before relying on its transaction guarantees.

Inspect `supabase/schema.sql` and the migrations for the authoritative schema.

---

## Git Workflow

The repository has used `main` and `gym` branches.

### Recommended workflow

1. Create or switch to a development branch.
2. Make and test changes.
3. Review the Git diff.
4. Commit the changes.
5. Push the branch.
6. Merge into the configured production branch when ready.
7. Confirm that Vercel deploys the intended commit.
8. Test the live application.

Example:

```bash
git status
git switch gym
git add .
git commit -m "Describe the change"
git push -u origin gym
```

Before pushing, confirm that the changes are on the intended branch. If the production branch is `main`, merge the reviewed changes into `main` using a pull request or the project's established workflow.

Do not assume that pushing to `gym` updates production unless Vercel is configured to use `gym` as its production branch.

### Inspecting deployment failures

For Vercel:

1. Open the Vercel project.
2. Open Deployments.
3. Select the deployment for the relevant commit.
4. Inspect Build Logs and environment configuration.

For GitHub Actions:

1. Open the repository's Actions tab.
2. Select the relevant workflow run.
3. Open the failed job.
4. Expand the failed step and inspect the complete error.

A successful frontend build does not, by itself, verify Supabase authentication or database access.

---

## Testing and Verification

### Build validation

The project documentation records successful execution of the following checks at an earlier development milestone:

- Frozen-lockfile dependency installation.
- TypeScript checking.
- Production build.
- Linting.

The mobile layout fix was also reported to pass `pnpm typecheck`, `pnpm build`, and `pnpm lint`, with three non-blocking React effect advisories noted at that time.

These are historical results. Run the checks again after subsequent changes.

### Manual functional verification

Before relying on the tracker for daily workouts, verify:

1. Register two accounts and confirm that neither can access the other's records.
2. Add, edit, and delete a weight entry and a food entry.
3. Start cardio, pause, refresh, resume, and finish the timer.
4. Confirm that paused time is excluded and the heatmap updates.
5. Start a strength workout, record sets, complete it, and inspect previous performance.
6. Add a gym, switch the active gym, create equipment and a custom exercise, and add it to a routine.
7. Edit and delete supported activities and verify that summaries recalculate.
8. Export the available CSV and JSON data and inspect the output.
9. Test registration, login, logout, and account deletion.
10. Repeat key tests on a phone and a desktop browser.
11. Verify that production is serving the intended Git commit.

### Remaining verification

Successful Vercel deployment does not establish that all production database operations work correctly.

Authentication, cloud mutations, account isolation, database migrations, and all-device mobile behavior should be tested against the actual configured Supabase project and deployed application.

---

## Troubleshooting

### The application is not responsive on a phone

- Open the current production URL.
- Confirm the deployment contains the latest mobile CSS changes.
- Test the CSS viewport width in browser developer tools.
- Check the responsive breakpoint and any conflicting CSS rules.
- Inspect whether the desktop sidebar or fixed-width elements remain active.
- Test the heatmap and tables independently from the dashboard layout.

### Changes do not appear on the live website

- Confirm that the changes were committed and pushed.
- Confirm the branch associated with the commit.
- Check Vercel's configured production branch.
- Inspect the latest deployment and its source commit.
- Check whether the deployment is Ready.
- Confirm that the browser is opening the intended production domain rather than an older preview URL.

### Vercel deployment fails

- Open the failed deployment's build logs.
- Verify the Node.js version and package manager.
- Check the build command and output directory.
- Confirm that the lockfile is committed.
- Verify the required environment variables.
- Fix the underlying error and push a new commit or redeploy.

### GitHub Pages reports HTTP 404

The earlier workflow failed while attempting to create a Pages deployment. Check repository visibility, Settings → Pages, the configured publishing source, and the complete Actions log.

Do not assume GitHub Pages is operational just because the build artifact was uploaded successfully. The deployment step must also succeed.

### Supabase setup instructions appear

- Verify `VITE_SUPABASE_URL`.
- Verify `VITE_SUPABASE_ANON_KEY`.
- Confirm the environment variables belong to the intended Supabase project.
- Restart the local development server or trigger a new production build.

### Login or redirect fails

- Check the Supabase Authentication URL Configuration.
- Confirm the deployed domain is included in the allowed redirect URLs.
- Check whether email confirmation is enabled.
- Inspect browser console errors and Supabase Auth responses.

### RLS or database errors occur

- Confirm the correct schema and migrations were applied.
- Check the authenticated user's identity.
- Inspect the relevant table's RLS policies.
- Verify that the frontend uses the public anon/publishable key.
- Never bypass RLS by exposing the service-role key.

---

## Future Development and AI Handoff

Before making changes, read these files if they exist:

1. `AGENTS.md` — developer instructions and repository-specific rules.
2. `PROJECT_CONTEXT.md` — architecture, project decisions, and current status.
3. `TODO.md` — pending tasks and known gaps.
4. `CHANGELOG.md` — recent changes and validation results.
5. `supabase/schema.sql` and the applicable migration files — database structure and security rules.
6. `.github/workflows/deploy.yml` — existing GitHub Pages workflow.
7. `package.json` and the lockfile — dependencies, scripts, and package-manager requirements.

Then inspect the actual application source, including `src/App.tsx`, `src/App.css`, and related components and stylesheets. File locations may change, so verify the current repository structure first.

### Development principles

- Preserve the existing design and working features unless a change is explicitly requested.
- Do not fabricate activity statistics or workout records.
- Preserve historical workout data when routines, exercises, or equipment are edited.
- Keep user data isolated with RLS.
- Never expose secrets.
- Test responsive behavior at realistic mobile widths.
- Run typecheck, build, and lint after meaningful changes.
- Update the documentation after changes to architecture, deployment, security, or user-facing behavior.
- Record what was actually tested and distinguish verified behavior from assumptions.
- Confirm the production branch and deployment status before claiming that a change is live.

### Suggested next steps

- Complete the full manual verification checklist against the configured Supabase project.
- Verify authentication and data isolation with two accounts.
- Test the tracker on older and newer mobile browsers.
- Review outstanding lint advisories.
- Confirm Vercel production branch settings and keep deployment documentation synchronized with the actual configuration.
- Continue improving usability for quick workout logging on a phone.

---

## License

No license is specified here. Add a license file if you intend to publish the project for reuse by others.

---

**Project summary:** Gym Ledger is a React and TypeScript fitness tracker with Supabase authentication and PostgreSQL storage, deployed as a web application on Vercel. It supports strength training, cardio, nutrition, weight tracking, activity history, and mobile-browser access. The repository documentation is the starting point for future maintenance, but the actual source code and live deployment should always be checked before making changes.
