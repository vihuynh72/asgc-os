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
- Status: phases 01–24 are implemented and have been pushed to Supabase.

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

- PHASE 08.1 — Projects fixes: ✅ complete
	- Migration: [supabase/migrations/202512160010_phase08_1_projects_fix.sql](supabase/migrations/202512160010_phase08_1_projects_fix.sql)
	- Aligns API semantics (no hard-delete) and tightens invariants.

- PHASE 09 — Comments + attachments v1: ✅ complete
	- Migration: [supabase/migrations/202512160009_phase09_comments_attachments_v1.sql](supabase/migrations/202512160009_phase09_comments_attachments_v1.sql)
	- API:
		- Comments: [apps/web/src/app/api/tasks/[taskId]/comments/route.ts](apps/web/src/app/api/tasks/[taskId]/comments/route.ts)
		- Comment item: [apps/web/src/app/api/tasks/[taskId]/comments/[commentId]/route.ts](apps/web/src/app/api/tasks/[taskId]/comments/[commentId]/route.ts)
		- Attachments: [apps/web/src/app/api/tasks/[taskId]/attachments/route.ts](apps/web/src/app/api/tasks/[taskId]/attachments/route.ts)
		- Attachment item: [apps/web/src/app/api/tasks/[taskId]/attachments/[attachmentId]/route.ts](apps/web/src/app/api/tasks/[taskId]/attachments/[attachmentId]/route.ts)
	- UI:
		- Task details panel (comments + URL attachments): [apps/web/src/app/tasks/tasks-panel.tsx](apps/web/src/app/tasks/tasks-panel.tsx)
	- RLS smoke: [supabase/rls/phase09_rls_smoke.sql](supabase/rls/phase09_rls_smoke.sql)

- PHASE 10 — Notifications plumbing: ✅ complete
	- Migration: [supabase/migrations/202512160011_phase10_notifications_plumbing.sql](supabase/migrations/202512160011_phase10_notifications_plumbing.sql)
	- Email sender (Resend): [apps/web/src/lib/emailSender.ts](apps/web/src/lib/emailSender.ts)
	- Admin endpoint: [apps/web/src/app/api/admin/send-test-email/route.ts](apps/web/src/app/api/admin/send-test-email/route.ts)
	- Admin UI button: [apps/web/src/app/admin/admin-panel.tsx](apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase10_rls_smoke.sql](supabase/rls/phase10_rls_smoke.sql)

- PHASE 11 — Office config + quiet hours: ✅ complete
	- Migration: [supabase/migrations/202512160012_phase11_office_config.sql](supabase/migrations/202512160012_phase11_office_config.sql)
	- Admin API: [apps/web/src/app/api/admin/office-config/route.ts](apps/web/src/app/api/admin/office-config/route.ts)
	- Admin UI: [apps/web/src/app/admin/admin-panel.tsx](apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase11_rls_smoke.sql](supabase/rls/phase11_rls_smoke.sql)

- PHASE 12 — Office hour requirements config: ✅ complete
	- Migration: [supabase/migrations/202512170001_phase12_office_hour_requirements_config.sql](supabase/migrations/202512170001_phase12_office_hour_requirements_config.sql)
	- Admin API: [apps/web/src/app/api/admin/office-hour-requirements/route.ts](apps/web/src/app/api/admin/office-hour-requirements/route.ts)
	- Admin UI: [apps/web/src/app/admin/admin-panel.tsx](apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase12_rls_smoke.sql](supabase/rls/phase12_rls_smoke.sql)

- PHASE 13 — Presence tokens (PIN generator): ✅ complete
	- Migration: [supabase/migrations/202512170002_phase13_presence_tokens_pin.sql](supabase/migrations/202512170002_phase13_presence_tokens_pin.sql)
	- Admin API (returns current PIN): [apps/web/src/app/api/admin/presence-pin/route.ts](apps/web/src/app/api/admin/presence-pin/route.ts)
	- Admin UI (kiosk display): [apps/web/src/app/admin/admin-panel.tsx](apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase13_rls_smoke.sql](supabase/rls/phase13_rls_smoke.sql)

- PHASE 14 — Office hours check-in v1: ✅ complete
	- Migration: [supabase/migrations/202512170003_phase14_office_hours_checkin_v1.sql](supabase/migrations/202512170003_phase14_office_hours_checkin_v1.sql)

- PHASE 15 — Office hours checkout v1: ✅ complete
	- Migration: [supabase/migrations/202512170004_phase15_office_hours_checkout_v1.sql](supabase/migrations/202512170004_phase15_office_hours_checkout_v1.sql)

- PHASE 16 — Timesheet v1: ✅ complete
	- Migration: [supabase/migrations/202512170005_phase16_timesheet_v1.sql](supabase/migrations/202512170005_phase16_timesheet_v1.sql)

- PHASE 17 — Shifts v1: ✅ complete
	- Migration: [supabase/migrations/202512170006_phase17_shifts_v1.sql](supabase/migrations/202512170006_phase17_shifts_v1.sql)

- PHASE 18 — Reminders v1: ✅ complete
	- Migration: [supabase/migrations/202512170007_phase18_reminders_v1.sql](supabase/migrations/202512170007_phase18_reminders_v1.sql)

- PHASE 19 — Auto-close v1: ✅ complete
	- Migration: [supabase/migrations/202512170009_phase19_auto_close_v1.sql](supabase/migrations/202512170009_phase19_auto_close_v1.sql)

- PHASE 20 — Coverage v1: ✅ complete
	- Migration: [supabase/migrations/202512170010_phase20_coverage_v1.sql](supabase/migrations/202512170010_phase20_coverage_v1.sql)

- PHASE 21 — Meetings v1: ✅ complete
	- Migration: [supabase/migrations/202512170011_phase21_meetings_v1.sql](supabase/migrations/202512170011_phase21_meetings_v1.sql)
	- API: [apps/web/src/app/api/meetings/route.ts](apps/web/src/app/api/meetings/route.ts)
	- UI: [apps/web/src/app/meetings/page.tsx](apps/web/src/app/meetings/page.tsx)

- PHASE 22 — Agenda Items Intake: ✅ complete
	- Migration: [supabase/migrations/202512170013_phase22_agenda_items_v1.sql](supabase/migrations/202512170013_phase22_agenda_items_v1.sql)
	- API: [apps/web/src/app/api/meetings/[meetingId]/agenda-items/route.ts](apps/web/src/app/api/meetings/[meetingId]/agenda-items/route.ts)
	- UI: [apps/web/src/app/meetings/[meetingId]/page.tsx](apps/web/src/app/meetings/[meetingId]/page.tsx)

- PHASE 23 — Deadline Enforcement: ✅ complete
	- Migration: [supabase/migrations/202512170014_phase23_deadline_config_v1.sql](supabase/migrations/202512170014_phase23_deadline_config_v1.sql)
	- Logic: Integrated into agenda item submission RPCs.

- PHASE 24 — Docs Library v1: ✅ complete
	- Migration: [supabase/migrations/202512170015_phase24_docs_v1.sql](supabase/migrations/202512170015_phase24_docs_v1.sql)
	- API: [apps/web/src/app/api/docs/route.ts](apps/web/src/app/api/docs/route.ts)
	- UI: [apps/web/src/app/docs/page.tsx](apps/web/src/app/docs/page.tsx)

## Handoff notes (for the next AI/dev)

### Patterns to follow (do not deviate)

- RLS is authoritative for data access.
- Admin-only writes happen via server routes using the service-role client (`getSupabaseAdminClient()`), never from the browser.
- User/session auth in Route Handlers uses `@supabase/ssr` `createServerClient(...)` + `supabase.auth.getUser()` (cookie-based).
- Audit logging under RLS should be done via `SECURITY DEFINER` triggers/functions with pinned `search_path` and execution revoked.

### Where to start next (Phase 25)

Phase 25 (Budget & Funding v1) should:

- Implement `budget_lines` table to track allocations.
- Implement `funding_requests` table for student organizations/committees to request funds.
- Add workflow for funding request review (submitted -> committee_review -> board_review -> approved/rejected).
- Link funding requests to agenda items for meeting discussion.

### Quick verification checklist

- Login works via allowlist magic link.
- `/admin` loads for admins only.
- Meetings: View upcoming meetings and click into details.
- Agenda Items: Submit a draft agenda item for a meeting, then finalize it.
- Admin: Review (accept/reject) submitted agenda items.
- Docs: Upload a document to the library and verify visibility filters.
- Tasks: create a task, add a comment, add a URL attachment.

Next up (per the phase list):

- PHASE 25 — Budget & Funding v1 (not started)

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