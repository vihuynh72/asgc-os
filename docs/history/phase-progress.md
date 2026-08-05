# ASGC OS implementation history

This file is the historical phase ledger for the Associated Students of Grossmont College operations platform. It records what earlier implementation phases claimed at the time. Use the root [`README.md`](../../README.md), current code, applied migrations, and verified runtime behavior for current setup and status.

The original build packet is retained as design input:

- [00_product_brief.md](../specifications/00_product_brief.md)
- [01_stack_and_architecture.md](../specifications/01_stack_and_architecture.md)
- [02_data_model.md](../specifications/02_data_model.md)
- [03_security_and_permissions.md](../specifications/03_security_and_permissions.md)
- [04_office_hours_spec.md](../specifications/04_office_hours_spec.md)

## TL;DR for a new dev/AI

- App: Next.js App Router under [apps/web](../../apps/web)
- DB: Supabase Postgres + RLS. Schema is managed via migrations under [supabase/migrations](../../supabase/migrations)
- Workflow: use Supabase CLI to push migrations (dry-run first). Avoid manual SQL editor except for emergencies.
- Historical status: phases 01–50 were recorded as complete in this ledger.

## Phase progress (Build Packet)

The original implementation followed [01_stack_and_architecture.md](../specifications/01_stack_and_architecture.md) phase by phase.

- PHASE 01 — Bootstrap: ✅ complete
	- Next.js app scaffolded under [apps/web](../../apps/web)
	- Minimal layout/nav + placeholder pages
	- Env validation wrappers

- PHASE 02 — Auth (invite-only): ✅ complete
	- Migration: [supabase/migrations/202512160001_phase02_auth_invite_only.sql](../../supabase/migrations/202512160001_phase02_auth_invite_only.sql)
	- Patch (enforce allowlist in Auth DB): [supabase/migrations/202512180002_phase02_1_enforce_invite_only_auth.sql](../../supabase/migrations/202512180002_phase02_1_enforce_invite_only_auth.sql)
	- Invite-only magic link flow:
		- Login page: [apps/web/src/app/(auth)/login/page.tsx](../../apps/web/src/app/(auth)/login/page.tsx)
		- Request link endpoint (allowlist-gated): [apps/web/src/app/api/auth/request-magic-link/route.ts](../../apps/web/src/app/api/auth/request-magic-link/route.ts)
		- Callback route (sets session cookies): [apps/web/src/app/auth/callback/route.ts](../../apps/web/src/app/auth/callback/route.ts)
		- Protected routes proxy: [apps/web/src/proxy.ts](../../apps/web/src/proxy.ts)
		- Admin invite/allowlist manager (supports `@domain` entries): [apps/web/src/app/api/admin/invites-allowlist/route.ts](../../apps/web/src/app/api/admin/invites-allowlist/route.ts)

- PHASE 03 — Roles + term model: ✅ complete
	- Migration: [supabase/migrations/202512160002_phase03_terms_roles_admin.sql](../../supabase/migrations/202512160002_phase03_terms_roles_admin.sql)

- PHASE 04 — RLS baseline: ✅ complete
	- Migration: [supabase/migrations/202512160003_phase04_rls_baseline.sql](../../supabase/migrations/202512160003_phase04_rls_baseline.sql)

- PHASE 05 — Audit log + invariants: ✅ complete
	- Migration: [supabase/migrations/202512160004_phase05_audit_log_and_invariants.sql](../../supabase/migrations/202512160004_phase05_audit_log_and_invariants.sql)
	- Important pattern: anything that writes to `audit_log` from user-driven actions must bypass RLS safely (see PHASE 07.1 fix below).

- PHASE 06 — Office hours + weekly dashboard: ✅ complete
	- Migration: [supabase/migrations/202512160005_phase06_office_hours_weekly_dashboard.sql](../../supabase/migrations/202512160005_phase06_office_hours_weekly_dashboard.sql)
	- UI page: [apps/web/src/app/office-hours/page.tsx](../../apps/web/src/app/office-hours/page.tsx)

- PHASE 07 — Tasks v1 (committee-scoped): ✅ complete
	- Migration: [supabase/migrations/202512160006_phase07_tasks_v1.sql](../../supabase/migrations/202512160006_phase07_tasks_v1.sql)
	- Adds: `committees`, `committee_memberships`, `tasks` + RLS + invariants triggers
	- API:
		- Tasks collection: [apps/web/src/app/api/tasks/route.ts](../../apps/web/src/app/api/tasks/route.ts)
		- Task item: [apps/web/src/app/api/tasks/[taskId]/route.ts](../../apps/web/src/app/api/tasks/[taskId]/route.ts)
	- UI:
		- Tasks page: [apps/web/src/app/tasks/page.tsx](../../apps/web/src/app/tasks/page.tsx)

- PHASE 07.1 — Tasks audit fix + stricter invariants: ✅ complete
	- Migration: [supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql](../../supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql)
	- Why this exists: the initial tasks audit trigger could fail under RLS because `audit_log` is admin-only readable and typically has no direct INSERT policy for end users.
	- Fix approach:
		- `audit_tasks_change()` is `SECURITY DEFINER` with a pinned `search_path`
		- execution revoked from `public`/`authenticated`
		- additional invariants trigger freezes key fields (created_by / committee_id / created_at)

- PHASE 08 — Projects v1 (committee-scoped + linked to tasks): ✅ complete
	- Migration: [supabase/migrations/202512160008_phase08_projects_v1.sql](../../supabase/migrations/202512160008_phase08_projects_v1.sql)
	- Adds: `projects` table + RLS + audit trigger
	- Links: `tasks.project_id` foreign key
	- Integrity: trigger to prevent cross-committee linking (task cannot reference a project from a different committee)
	- API:
		- Projects collection: [apps/web/src/app/api/projects/route.ts](../../apps/web/src/app/api/projects/route.ts)
		- Project item: [apps/web/src/app/api/projects/[projectId]/route.ts](../../apps/web/src/app/api/projects/[projectId]/route.ts)
	- UI:
		- Projects page: [apps/web/src/app/projects/page.tsx](../../apps/web/src/app/projects/page.tsx)
		- Project → Tasks deep link: `/tasks?projectId=<uuid>`

- PHASE 08.1 — Projects fixes: ✅ complete
	- Migration: [supabase/migrations/202512160010_phase08_1_projects_fix.sql](../../supabase/migrations/202512160010_phase08_1_projects_fix.sql)
	- Aligns API semantics (no hard-delete) and tightens invariants.

- PHASE 09 — Comments + attachments v1: ✅ complete
	- Migration: [supabase/migrations/202512160009_phase09_comments_attachments_v1.sql](../../supabase/migrations/202512160009_phase09_comments_attachments_v1.sql)
	- API:
		- Comments: [apps/web/src/app/api/tasks/[taskId]/comments/route.ts](../../apps/web/src/app/api/tasks/[taskId]/comments/route.ts)
		- Comment item: [apps/web/src/app/api/tasks/[taskId]/comments/[commentId]/route.ts](../../apps/web/src/app/api/tasks/[taskId]/comments/[commentId]/route.ts)
		- Attachments: [apps/web/src/app/api/tasks/[taskId]/attachments/route.ts](../../apps/web/src/app/api/tasks/[taskId]/attachments/route.ts)
		- Attachment item: [apps/web/src/app/api/tasks/[taskId]/attachments/[attachmentId]/route.ts](../../apps/web/src/app/api/tasks/[taskId]/attachments/[attachmentId]/route.ts)
	- UI:
		- Task details panel (comments + URL attachments): [apps/web/src/app/tasks/tasks-panel.tsx](../../apps/web/src/app/tasks/tasks-panel.tsx)
	- RLS smoke: [supabase/rls/phase09_rls_smoke.sql](../../supabase/rls/phase09_rls_smoke.sql)

- PHASE 10 — Notifications plumbing: ✅ complete
	- Migration: [supabase/migrations/202512160011_phase10_notifications_plumbing.sql](../../supabase/migrations/202512160011_phase10_notifications_plumbing.sql)
	- Email sender (Resend): [apps/web/src/lib/emailSender.ts](../../apps/web/src/lib/emailSender.ts)
	- Admin endpoint: [apps/web/src/app/api/admin/send-test-email/route.ts](../../apps/web/src/app/api/admin/send-test-email/route.ts)
	- Admin UI button: [apps/web/src/app/admin/admin-panel.tsx](../../apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase10_rls_smoke.sql](../../supabase/rls/phase10_rls_smoke.sql)

- PHASE 11 — Office config + quiet hours: ✅ complete
	- Migration: [supabase/migrations/202512160012_phase11_office_config.sql](../../supabase/migrations/202512160012_phase11_office_config.sql)
	- Admin API: [apps/web/src/app/api/admin/office-config/route.ts](../../apps/web/src/app/api/admin/office-config/route.ts)
	- Admin UI: [apps/web/src/app/admin/admin-panel.tsx](../../apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase11_rls_smoke.sql](../../supabase/rls/phase11_rls_smoke.sql)

- PHASE 12 — Office hour requirements config: ✅ complete
	- Migration: [supabase/migrations/202512170001_phase12_office_hour_requirements_config.sql](../../supabase/migrations/202512170001_phase12_office_hour_requirements_config.sql)
	- Admin API: [apps/web/src/app/api/admin/office-hour-requirements/route.ts](../../apps/web/src/app/api/admin/office-hour-requirements/route.ts)
	- Admin UI: [apps/web/src/app/admin/admin-panel.tsx](../../apps/web/src/app/admin/admin-panel.tsx)
	- RLS smoke: [supabase/rls/phase12_rls_smoke.sql](../../supabase/rls/phase12_rls_smoke.sql)

- PATCH — Office Hours (remove kiosk PIN): ✅ complete
	- Migration: [supabase/migrations/202512180005_patch_office_hours_remove_pin.sql](../../supabase/migrations/202512180005_patch_office_hours_remove_pin.sql)

- PHASE 14 — Office hours check-in v1: ✅ complete
	- Migration: [supabase/migrations/202512170003_phase14_office_hours_checkin_v1.sql](../../supabase/migrations/202512170003_phase14_office_hours_checkin_v1.sql)

- PHASE 15 — Office hours checkout v1: ✅ complete
	- Migration: [supabase/migrations/202512170004_phase15_office_hours_checkout_v1.sql](../../supabase/migrations/202512170004_phase15_office_hours_checkout_v1.sql)

- PHASE 16 — Timesheet v1: ✅ complete
	- Migration: [supabase/migrations/202512170005_phase16_timesheet_v1.sql](../../supabase/migrations/202512170005_phase16_timesheet_v1.sql)

- PHASE 17 — Shifts v1: ✅ complete
	- Migration: [supabase/migrations/202512170006_phase17_shifts_v1.sql](../../supabase/migrations/202512170006_phase17_shifts_v1.sql)

- PHASE 18 — Reminders v1: ✅ complete
	- Migration: [supabase/migrations/202512170007_phase18_reminders_v1.sql](../../supabase/migrations/202512170007_phase18_reminders_v1.sql)

- PHASE 19 — Auto-close v1: ✅ complete
	- Migration: [supabase/migrations/202512170009_phase19_auto_close_v1.sql](../../supabase/migrations/202512170009_phase19_auto_close_v1.sql)
	- Patch (fix auto-close function dependency): [supabase/migrations/202512180001_patch_phase19_auto_close.sql](../../supabase/migrations/202512180001_patch_phase19_auto_close.sql)

- PHASE 20 — Coverage v1: ✅ complete
	- Migration: [supabase/migrations/202512170010_phase20_coverage_v1.sql](../../supabase/migrations/202512170010_phase20_coverage_v1.sql)

- PHASE 21 — Meetings v1: ✅ complete
	- Migration: [supabase/migrations/202512170011_phase21_meetings_v1.sql](../../supabase/migrations/202512170011_phase21_meetings_v1.sql)
	- API: [apps/web/src/app/api/meetings/route.ts](../../apps/web/src/app/api/meetings/route.ts)
	- UI: [apps/web/src/app/meetings/page.tsx](../../apps/web/src/app/meetings/page.tsx)

- PHASE 22 — Agenda Items Intake: ✅ complete
	- Migration: [supabase/migrations/202512170013_phase22_agenda_items_v1.sql](../../supabase/migrations/202512170013_phase22_agenda_items_v1.sql)
	- API: [apps/web/src/app/api/meetings/[meetingId]/agenda-items/route.ts](../../apps/web/src/app/api/meetings/[meetingId]/agenda-items/route.ts)
	- UI: [apps/web/src/app/meetings/[meetingId]/page.tsx](../../apps/web/src/app/meetings/[meetingId]/page.tsx)

- PHASE 23 — Deadline Enforcement: ✅ complete
	- Migration: [supabase/migrations/202512170014_phase23_deadline_config_v1.sql](../../supabase/migrations/202512170014_phase23_deadline_config_v1.sql)
	- Logic: Integrated into agenda item submission RPCs.

- PHASE 24 — Docs Library v1: ✅ complete
	- Migration: [supabase/migrations/202512170015_phase24_docs_v1.sql](../../supabase/migrations/202512170015_phase24_docs_v1.sql)
	- API: [apps/web/src/app/api/docs/route.ts](../../apps/web/src/app/api/docs/route.ts)
	- UI: [apps/web/src/app/docs/page.tsx](../../apps/web/src/app/docs/page.tsx)

- PHASE 25/26 — Minutes upload + committee notes: ✅ complete
	- Migration: [supabase/migrations/202512190002_phase25_26_minutes_notes.sql](../../supabase/migrations/202512190002_phase25_26_minutes_notes.sql)
	- UI: [apps/web/src/app/meetings/[meetingId]/meeting-docs-panel.tsx](../../apps/web/src/app/meetings/[meetingId]/meeting-docs-panel.tsx)

- PHASE 27 — AI summarize (single doc type): ✅ complete
	- Migration: [supabase/migrations/202512190003_phase27_doc_summaries.sql](../../supabase/migrations/202512190003_phase27_doc_summaries.sql)

- PHASE 28/29 — Suggested tasks + review workflow: ✅ complete
	- Migration: [supabase/migrations/202512190004_phase28_29_suggested_tasks_review.sql](../../supabase/migrations/202512190004_phase28_29_suggested_tasks_review.sql)
	- UI: [apps/web/src/app/tasks/page.tsx](../../apps/web/src/app/tasks/page.tsx)

- PHASE 30 — Agenda builder v1: ✅ complete
	- API: [apps/web/src/app/api/meetings/[meetingId]/agenda-pdf/route.ts](../../apps/web/src/app/api/meetings/[meetingId]/agenda-pdf/route.ts)
	- UI: [apps/web/src/app/meetings/[meetingId]/meeting-docs-panel.tsx](../../apps/web/src/app/meetings/[meetingId]/meeting-docs-panel.tsx)

- PHASE 31 — Budget lines v1: ✅ complete
	- Migration: [supabase/migrations/202512190006_phase31_budget_lines_v1.sql](../../supabase/migrations/202512190006_phase31_budget_lines_v1.sql)
	- API: [apps/web/src/app/api/finance/budget-lines/route.ts](../../apps/web/src/app/api/finance/budget-lines/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 32 — Funding request intake: ✅ complete
	- Migration: [supabase/migrations/202512190007_phase32_funding_requests_v1.sql](../../supabase/migrations/202512190007_phase32_funding_requests_v1.sql)
	- API: [apps/web/src/app/api/finance/funding-requests/route.ts](../../apps/web/src/app/api/finance/funding-requests/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 33 — Threshold routing + state machine: ✅ complete
	- Migration: [supabase/migrations/202512190008_phase33_finance_config_and_state.sql](../../supabase/migrations/202512190008_phase33_finance_config_and_state.sql)
	- API: [apps/web/src/app/api/finance/funding-requests/[requestId]/transition/route.ts](../../apps/web/src/app/api/finance/funding-requests/[requestId]/transition/route.ts)

- PHASE 34 — Vote capture v1: ✅ complete
	- Migration: [supabase/migrations/202512190009_phase34_board_votes_v1.sql](../../supabase/migrations/202512190009_phase34_board_votes_v1.sql)
	- API: [apps/web/src/app/api/finance/board-votes/route.ts](../../apps/web/src/app/api/finance/board-votes/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 35 — Expense logging v1: ✅ complete
	- Migration: [supabase/migrations/202512190010_phase35_expenses_v1.sql](../../supabase/migrations/202512190010_phase35_expenses_v1.sql)
	- API: [apps/web/src/app/api/finance/expenses/route.ts](../../apps/web/src/app/api/finance/expenses/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 36 — Budget burn-down: ✅ complete
	- Migration: [supabase/migrations/202512190011_phase36_budget_burndown.sql](../../supabase/migrations/202512190011_phase36_budget_burndown.sql)
	- API: [apps/web/src/app/api/finance/budget-burndown/route.ts](../../apps/web/src/app/api/finance/budget-burndown/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 37 — Grant cycle v1: ✅ complete
	- Migration: [supabase/migrations/202512190012_phase37_grant_cycles_v1.sql](../../supabase/migrations/202512190012_phase37_grant_cycles_v1.sql)
	- API: [apps/web/src/app/api/finance/grant-cycles/route.ts](../../apps/web/src/app/api/finance/grant-cycles/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 38 — Grant intake: ✅ complete
	- Migration: [supabase/migrations/202512190013_phase38_grant_applications_v1.sql](../../supabase/migrations/202512190013_phase38_grant_applications_v1.sql)
	- API: [apps/web/src/app/api/finance/grant-applications/route.ts](../../apps/web/src/app/api/finance/grant-applications/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 39 — Service contract lead-time warnings: ✅ complete
	- Migration: [supabase/migrations/202512190014_phase39_contract_lead_time.sql](../../supabase/migrations/202512190014_phase39_contract_lead_time.sql)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 40 — Finance dashboard exports: ✅ complete
	- API: [apps/web/src/app/api/finance/exports/route.ts](../../apps/web/src/app/api/finance/exports/route.ts)
	- UI: [apps/web/src/app/finance/page.tsx](../../apps/web/src/app/finance/page.tsx)

- PHASE 41 — Clubs registry v1: ✅ complete
	- Migration: [supabase/migrations/202512220001_phase41_clubs_registry_v1.sql](../../supabase/migrations/202512220001_phase41_clubs_registry_v1.sql)
	- API: [apps/web/src/app/api/clubs/route.ts](../../apps/web/src/app/api/clubs/route.ts)
	- UI: [apps/web/src/app/clubs/page.tsx](../../apps/web/src/app/clubs/page.tsx)

- PHASE 42 — Charter checklist: ✅ complete
	- Migration: [supabase/migrations/202512220002_phase42_charter_checklist_v1.sql](../../supabase/migrations/202512220002_phase42_charter_checklist_v1.sql)
	- API: [apps/web/src/app/api/clubs/checklist/route.ts](../../apps/web/src/app/api/clubs/checklist/route.ts)
	- UI: [apps/web/src/app/clubs/page.tsx](../../apps/web/src/app/clubs/page.tsx)

- PHASE 43 — ICC meetings + attendance v1: ✅ complete
	- Migration: [supabase/migrations/202512220003_phase43_icc_meetings_v1.sql](../../supabase/migrations/202512220003_phase43_icc_meetings_v1.sql)
	- API: [apps/web/src/app/api/icc/meetings/route.ts](../../apps/web/src/app/api/icc/meetings/route.ts)
	- UI: [apps/web/src/app/icc/page.tsx](../../apps/web/src/app/icc/page.tsx)

- PHASE 44 — ICC absence/quorum flags: ✅ complete
	- Migration: [supabase/migrations/202512220004_phase44_icc_absence_quorum_flags.sql](../../supabase/migrations/202512220004_phase44_icc_absence_quorum_flags.sql)
	- API: [apps/web/src/app/api/icc/absence/route.ts](../../apps/web/src/app/api/icc/absence/route.ts)
	- UI: [apps/web/src/app/icc/page.tsx](../../apps/web/src/app/icc/page.tsx)

- PHASE 45 — Club funding eligibility v1: ✅ complete
	- Migration: [supabase/migrations/202512220005_phase45_club_eligibility_v1.sql](../../supabase/migrations/202512220005_phase45_club_eligibility_v1.sql)
	- UI: [apps/web/src/app/clubs/page.tsx](../../apps/web/src/app/clubs/page.tsx)

- PHASE 46 — Permissions hardening v2: ✅ complete
	- Migration: [supabase/migrations/202512220006_phase46_permissions_hardening_v2.sql](../../supabase/migrations/202512220006_phase46_permissions_hardening_v2.sql)
	- Docs: [docs/security/rls-matrix-v2.md](../security/rls-matrix-v2.md)

- PHASE 47 — Backups & retention: ✅ complete
	- Scripts: [scripts/backup/run_backup.sh](../../scripts/backup/run_backup.sh), [scripts/backup/export_storage.sh](../../scripts/backup/export_storage.sh)
	- Docs: [docs/ops/backups-retention.md](../ops/backups-retention.md), [docs/ops/restore-checklist.md](../ops/restore-checklist.md)

- PHASE 48 — Security review pass: ✅ complete
	- Docs: [docs/security/threat-model.md](../security/threat-model.md), [docs/security/log-review.md](../security/log-review.md), [docs/security/credential-rotation.md](../security/credential-rotation.md)

- PHASE 49 — Admin UX polish: ✅ complete
	- API: [apps/web/src/app/api/admin/bulk-import-members/route.ts](../../apps/web/src/app/api/admin/bulk-import-members/route.ts)
	- API: [apps/web/src/app/api/admin/terms/rollover/route.ts](../../apps/web/src/app/api/admin/terms/rollover/route.ts)
	- UI: [apps/web/src/app/admin/admin-panel.tsx](../../apps/web/src/app/admin/admin-panel.tsx)

- PHASE 50 — Launch runbook: ✅ complete
	- Docs: [docs/runbook/launch-runbook.md](../runbook/launch-runbook.md)

## Historical handoff notes

### Patterns recorded at handoff

- RLS is authoritative for data access.
- Admin-only writes happen via server routes using the service-role client (`getSupabaseAdminClient()`), never from the browser.
- User/session auth in Route Handlers uses `@supabase/ssr` `createServerClient(...)` + `supabase.auth.getUser()` (cookie-based).
- Audit logging under RLS should be done via `SECURITY DEFINER` triggers/functions with pinned `search_path` and execution revoked.

### Next step recorded at handoff

- Phase 51+ planning (TBD): post-launch enhancements, reporting, and UX refinements.

### Quick verification checklist

- Login works via allowlist magic link (Admin → Invites / allowlist supports `@gcccd.edu` domain entries).
- `/admin` loads for admins only.
- Office Hours: configure office geofence, then check in/out; auto location check runs every ~30 minutes and auto-checks out if outside grace radius.
- Meetings: View upcoming meetings and click into details.
- Agenda Items: Submit a draft agenda item for a meeting, then finalize it.
- Admin: Review (accept/reject) submitted agenda items.
- Docs: Upload a document to the library and verify visibility filters.
- Minutes: Upload meeting minutes from a meeting detail page, then download them.
- Committee Notes: Create a committee-only note, generate a summary, and extract suggested tasks.
- Suggested Tasks: Approve a suggested task and confirm it appears in Tasks.
- Agenda PDF: Generate an agenda PDF from accepted agenda items and download it.
- Finance: Create a budget line, submit a funding request with breakdown, transition status, record a vote, log an expense, view burn-down, and generate an export.
- Tasks: create a task, add a comment, add a URL attachment.
- Clubs: Create a club, upload a constitution, update checklist items, and confirm eligibility status.
- ICC: Create a meeting, record attendance, verify quorum status, and export attendance CSV.

The current setup, verification, database, and deployment procedures live in the root [`README.md`](../../README.md) and [`docs/runbook`](../runbook).

## Security notes (read this)

- Never paste keys/URLs into chat or commit history. If anything leaks, rotate it in Supabase immediately.
- RLS is the primary authorization layer. App code should assume RLS will enforce committee scoping.
- Audit log writes from end-user actions should happen via `SECURITY DEFINER` triggers/functions (see PHASE 07.1).
