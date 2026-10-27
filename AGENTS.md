# Instructions for AI coding assistants

Before editing this repository, read these files in order:

1. `AGENTS.md` — working rules and project constraints.
2. `PROJECT_CONTEXT.md` — architecture, feature map, setup, and verified state.
3. `TODO.md` — outstanding work and validation priorities.
4. The newest relevant entries in `CHANGELOG.md` — recent changes and their test status.
5. The actual source and SQL that a proposed change will touch. Documentation is helpful, but code is the source of truth.

## Project rules

- Preserve the existing React + TypeScript + Vite + Supabase architecture unless a change is necessary and documented.
- The site is a static frontend hosted on GitHub Pages. Do not introduce a server requirement for normal operation.
- Supabase is the authoritative persistent store. The browser may store only limited local UI state, such as an in-progress timer or workout draft.
- Never place a Supabase service-role key, password, private token, or other secret in frontend code, `.env.example`, documentation, or Git.
- Every personal database table must retain user-specific RLS. Keep user identifiers on writes and do not weaken policies to make the interface work.
- Preserve historic workouts and sets when a plan, exercise, equipment item, or gym is renamed or archived.
- Keep Saturday as the default leg day and preserve the dashboard's 52-week green activity heatmap as the main visual feature.
- Use the existing light theme and muted sage/neutral palette. Avoid unrelated UI redesigns.
- Use `import.meta.env.BASE_URL` or another Vite base-aware path for assets and authentication redirects that must work on GitHub Pages project sites.
- Distinguish a missing cloud configuration from a genuine empty account. Never substitute fabricated fitness data.
- Keep date handling consistent with `Asia/Kolkata` unless the user asks to change it.
- Avoid destructive SQL changes. If the schema changes for an already-deployed app, add a migration and explain its order of use.

## Before calling a task complete

1. Run `pnpm install --frozen-lockfile` from a clean dependency state if available.
2. Run `pnpm typecheck` (or `pnpm exec tsc -b`) and `pnpm build`.
3. Run relevant linting/tests if their native dependencies are available.
4. If Supabase is configured, test auth, RLS isolation with two accounts, CRUD operations, and cloud persistence. Never claim these checks ran without credentials and actual results.
5. Update `PROJECT_CONTEXT.md`, `CHANGELOG.md`, and `TODO.md` for every meaningful milestone.
6. State what passed, what failed, what was not testable, and why. A prior assistant's completion note is context, not current test evidence.

## Handoff expectations

- Prefer small, targeted patches over replacing working files wholesale.
- Keep `README.md` commands aligned with `package.json` and the workflow.
- Do not commit `node_modules/`, `dist/`, `.env`, generated secrets, or macOS metadata such as `__MACOSX/` and `.DS_Store`.
- When interrupted, leave `TODO.md` with the exact next concrete action and update `PROJECT_CONTEXT.md` with the last verified state.
