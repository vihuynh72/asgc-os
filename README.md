# ASGC OS (ASGC Work Operating System)

Internal-only web app for ASGC operations.

This repo is driven by the build packet files (treat these as the product + architecture source-of-truth):

- [00_product_brief.md](00_product_brief.md)
- [01_stack_and_architecture.md](01_stack_and_architecture.md)
- [02_data_model.md](02_data_model.md)
- [03_security_and_permissions.md](03_security_and_permissions.md)
- [04_office_hours_spec.md](04_office_hours_spec.md)

## TL;DR for a new dev/AI

- App: Next.js App Router under [apps/web](apps/web)
- DB: Supabase Postgres + RLS. Schema is managed via migrations under [supabase/migrations](supabase/migrations)
- Workflow: use Supabase CLI to push migrations (dry-run first). Avoid manual SQL editor except for emergencies.
- Status: phases 01–08 are implemented locally and have been pushed to Supabase.

## Phase progress (Build Packet)

This repo is built strictly phase-by-phase per [01_stack_and_architecture.md](01_stack_and_architecture.md).

- PHASE 01 — Bootstrap: ✅ complete
	- Next.js app scaffolded under [apps/web](apps/web)
	- Minimal layout/nav + placeholder pages
	- Env validation wrappers

- PHASE 02 — Auth (invite-only): ✅ complete
	- Migration: [supabase/migrations/202512160001_phase02_auth_invite_only.sql](supabase/migrations/202512160001_phase02_auth_invite_only.sql)
	- Invite-only magic link flow:
		- Login page: [apps/web/src/app/(auth)/login/page.tsx](apps/web/src/app/(auth)/login/page.tsx)
		- Request link endpoint (allowlist-gated): [apps/web/src/app/api/auth/request-magic-link/route.ts](apps/web/src/app/api/auth/request-magic-link/route.ts)
		- Callback route (sets session cookies): [apps/web/src/app/auth/callback/route.ts](apps/web/src/app/auth/callback/route.ts)
		- Protected routes middleware: [apps/web/src/middleware.ts](apps/web/src/middleware.ts)

- PHASE 03 — Roles + term model: ✅ complete
	- Migration: [supabase/migrations/202512160002_phase03_terms_roles_admin.sql](supabase/migrations/202512160002_phase03_terms_roles_admin.sql)

- PHASE 04 — RLS baseline: ✅ complete
	- Migration: [supabase/migrations/202512160003_phase04_rls_baseline.sql](supabase/migrations/202512160003_phase04_rls_baseline.sql)

- PHASE 05 — Audit log + invariants: ✅ complete
	- Migration: [supabase/migrations/202512160004_phase05_audit_log_and_invariants.sql](supabase/migrations/202512160004_phase05_audit_log_and_invariants.sql)
	- Important pattern: anything that writes to `audit_log` from user-driven actions must bypass RLS safely (see PHASE 07.1 fix below).

- PHASE 06 — Office hours + weekly dashboard: ✅ complete
	- Migration: [supabase/migrations/202512160005_phase06_office_hours_weekly_dashboard.sql](supabase/migrations/202512160005_phase06_office_hours_weekly_dashboard.sql)
	- UI page: [apps/web/src/app/office-hours/page.tsx](apps/web/src/app/office-hours/page.tsx)

- PHASE 07 — Tasks v1 (committee-scoped): ✅ complete
	- Migration: [supabase/migrations/202512160006_phase07_tasks_v1.sql](supabase/migrations/202512160006_phase07_tasks_v1.sql)
	- Adds: `committees`, `committee_memberships`, `tasks` + RLS + invariants triggers
	- API:
		- Tasks collection: [apps/web/src/app/api/tasks/route.ts](apps/web/src/app/api/tasks/route.ts)
		- Task item: [apps/web/src/app/api/tasks/[taskId]/route.ts](apps/web/src/app/api/tasks/[taskId]/route.ts)
	- UI:
		- Tasks page: [apps/web/src/app/tasks/page.tsx](apps/web/src/app/tasks/page.tsx)

- PHASE 07.1 — Tasks audit fix + stricter invariants: ✅ complete
	- Migration: [supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql](supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql)
	- Why this exists: the initial tasks audit trigger could fail under RLS because `audit_log` is admin-only readable and typically has no direct INSERT policy for end users.
	- Fix approach:
		- `audit_tasks_change()` is `SECURITY DEFINER` with a pinned `search_path`
		- execution revoked from `public`/`authenticated`
		- additional invariants trigger freezes key fields (created_by / committee_id / created_at)

- PHASE 08 — Projects v1 (committee-scoped + linked to tasks): ✅ complete
	- Migration: [supabase/migrations/202512160008_phase08_projects_v1.sql](supabase/migrations/202512160008_phase08_projects_v1.sql)
	- Adds: `projects` table + RLS + audit trigger
	- Links: `tasks.project_id` foreign key
	- Integrity: trigger to prevent cross-committee linking (task cannot reference a project from a different committee)
	- API:
		- Projects collection: [apps/web/src/app/api/projects/route.ts](apps/web/src/app/api/projects/route.ts)
		- Project item: [apps/web/src/app/api/projects/[projectId]/route.ts](apps/web/src/app/api/projects/[projectId]/route.ts)
	- UI:
		- Projects page: [apps/web/src/app/projects/page.tsx](apps/web/src/app/projects/page.tsx)
		- Project → Tasks deep link: `/tasks?projectId=<uuid>`

Next up (per the phase list):

- PHASE 09 — Comments + attachments (not started)

## Local dev (web)

1) Install dependencies

```sh
cd apps/web
npm install
```

2) Set env (no secrets committed)

```sh
cp .env.example .env.local
```

Then set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

For server-side operations (never `NEXT_PUBLIC_*`):

- `SUPABASE_SERVICE_ROLE_KEY`

3) Run

```sh
npm run dev
```

Open http://localhost:3000.

## Database workflow (Supabase CLI, recommended)

This repo treats migrations under [supabase/migrations](supabase/migrations) as the source of truth.

High-level rule:

- Prefer `supabase db push` to apply migrations.
- Avoid pasting SQL into the Dashboard SQL editor except for emergency/one-off debugging.

### Prereqs

- Install Supabase CLI (one-time): https://supabase.com/docs/guides/cli
- Have a Supabase personal access token:
	- create in Supabase Dashboard → Account → Access Tokens
	- export it locally as `SUPABASE_ACCESS_TOKEN`

### Link this repo to a Supabase project

From the repo root:

```sh
supabase login
supabase link --project-ref <your-project-ref>
```

Notes:

- `supabase login` will pick up `SUPABASE_ACCESS_TOKEN` if set.
- If you are on a fresh machine, this is the step that “connects” your local repo to the remote Supabase project.

### Push migrations (safe workflow)

Dry run first:

```sh
supabase db push --dry-run
```

If the output looks correct, push:

```sh
supabase db push
```

### What “success” looks like

- `supabase db push` reports all migrations applied
- App routes that rely on RLS work as expected when logged in

## Security notes (read this)

- Never paste keys/URLs into chat or commit history. If anything leaks, rotate it in Supabase immediately.
- RLS is the primary authorization layer. App code should assume RLS will enforce committee scoping.
- Audit log writes from end-user actions should happen via `SECURITY DEFINER` triggers/functions (see PHASE 07.1).