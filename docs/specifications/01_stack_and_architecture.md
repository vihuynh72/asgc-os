# Stack and Architecture
Status: Historical architecture and delivery plan. Current code and repository documentation take precedence.

## 0) Target constraints (solo builder)
- One-person build, minimal ops
- Mobile-first for office hours
- Strong permissions without a ton of custom auth code
- Cheap enough to run for ASGC (or on a student budget)

## 1) Recommended stack (Path C)
Frontend:
- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui
- PWA-ish behavior (optional): add-to-home-screen, offline-safe UI states

Backend:
- Supabase (Postgres + Auth + Storage + Edge Functions + RLS)
- RLS is non-negotiable: DB enforces permissions

Notifications:
- Email-first via Resend or SendGrid (phase 10)
- Optional later: Discord webhook (internal) + SMS

AI:
- OpenAI API (or compatible) called only from server/edge functions
- AI outputs stored as DRAFT records requiring approval

## 2) Architecture diagram (logical)
[ Next.js Web App ]
   |  (supabase-js)
   v
[ Supabase Auth ] -----> session + user
[ Postgres + RLS ] ----> tables + views
[ Storage Buckets ] ---> docs/receipts/minutes
[ Edge Functions ] ----> trusted ops (office hours, reminders, AI)
   |
   v
[ Email Provider ] ----> reminders + digests
[ AI Provider ] --------> summaries + task extraction

## 3) Repo structure (suggested)
/
  apps/web
    app/
      (auth)/
      dashboard/
      office-hours/
      tasks/
      meetings/
      docs/
      finance/
      admin/
    lib/
      supabaseClient.ts
      auth.ts
      policy.ts (client-side policy helpers, non-authoritative)
    components/
  supabase/
    migrations/
    functions/
      office_hours_checkin/
      office_hours_checkout/
      office_hours_reminders/
      weekly_digest/
      doc_ingest/
      ai_summarize/
    seed.sql
  tests/
    rls/
    functions/
    ui-smoke/

## 4) Environments (practical)
- dev: local Next.js + Supabase project (dev)
- staging: separate Supabase project (optional but recommended)
- prod: one Supabase project + hosted Next.js

## 5) Key product decisions (why this works)
- RLS policies reduce “oops I leaked finance records” risk.
- Edge Functions handle sensitive logic (token checks, thresholds, digests).
- Storage buckets keep minutes/receipts out of Git and properly permissioned.

## 6) Office hours presence model (high-level)
Goal: prevent easy cheating without being too strict.

Use layered checks:
1) browser geolocation (distance-to-office)
2) periodic location re-check while checked in
3) anomaly flags + admin review (not auto-punishment)

## 7) Observability (minimal but real)
- audit_log table for sensitive actions
- function logs for edge functions
- “dead letter” notification_log for failed emails
- admin dashboard widget: “errors last 7 days”

## 8) Testing strategy (solo-friendly)
- RLS tests: verify who can read/write which rows
- Function tests: office-hours checkin/checkout rules
- UI smoke: check-in flow + task creation + doc upload works

## 9) 50-phase build plan (incremental, low mistake rate)
Rules:
- Each phase is shippable
- Each phase adds at most 1–2 new concepts
- Each phase ends with: “demo checklist” + “acceptance checks”

PHASE 01 — Bootstrap
- Create Next.js app, TS, lint, env loader, Supabase client wrapper

PHASE 02 — Auth (invite-only)
- Email magic link auth
- allowlist table + block unknown emails
- profile auto-create trigger

PHASE 03 — Roles + term model
- roles table + role_assignments per term
- admin-only UI to assign roles

PHASE 04 — RLS baseline
- RLS on profiles, roles, role_assignments
- tests: user can read only allowed fields

PHASE 05 — Audit log v1
- audit_log table + helper function log_event()
- log role changes + admin actions

PHASE 06 — Dashboard v1
- “my tasks”, “my hours this week”, “my upcoming shifts”
- placeholder widgets for finance/meetings

PHASE 07 — Tasks v1
- tasks table + CRUD pages
- committee scoping (basic)

PHASE 08 — Projects v1
- projects table + link tasks to projects
- project list page

PHASE 09 — Comments + attachments v1
- task_comments
- attach doc links to tasks

PHASE 10 — Notifications plumbing
- integrate email provider
- notification_log table
- “send test email” admin tool

PHASE 11 — Office config
- office_locations config page
- quiet hours config

PHASE 12 — Requirements config
- office_hour_requirements per role
- UI to edit for a term

PHASE 13 — Presence validation v1 (no PIN)
- auto-check location periodically while checked in
- auto-check out if outside the office geofence

PHASE 14 — Check-in v1
- geofence distance calc
- create open office_hour_session
- audit log

PHASE 15 — Check-out v1
- close session, compute duration
- flag disputed if far at checkout
- audit log

PHASE 16 — Timesheet v1
- weekly totals view
- export CSV for a week

PHASE 17 — Shift scheduling v1
- office_hour_shift table
- user can see scheduled shifts
- admin can create shifts

PHASE 18 — Reminders v1
- cron: “shift starts soon”
- cron: “missed shift”
- log sends

PHASE 19 — Auto-close
- cron: close sessions > max duration
- notify user + log

PHASE 20 — Coverage workflow v1
- coverage request + claim
- notifications

PHASE 21 — Meetings v1
- meetings table + calendar/list
- meeting types (board/committee/ICC)

PHASE 22 — Agenda items intake
- agenda_items form submission
- attachments support

PHASE 23 — Deadline enforcement
- label late submissions
- lock submissions after cutoff (config)

PHASE 24 — Docs library v1
- docs table + storage buckets
- permissions by visibility + committee_id

PHASE 25 — Minutes upload v1
- minutes doc type + link to meeting
- versioning support

PHASE 26 — Committee notes spaces
- doc spaces per committee
- committee-only read/write

PHASE 27 — AI summarize (single doc type)
- edge function: summarize committee note -> doc_summary DRAFT

PHASE 28 — AI action items (draft tasks)
- extract tasks from summary -> suggested_tasks table (DRAFT)

PHASE 29 — Review workflow
- approve/reject suggested tasks
- publish approved tasks to tasks table

PHASE 30 — Agenda builder v1
- compile agenda PDF from agenda_items (simple template)
- export + attach to meeting docs

PHASE 31 — Budget lines v1
- budget_lines table + admin UI

PHASE 32 — Funding request intake
- funding_requests form + breakdown_json validation

PHASE 33 — Threshold routing
- if amount >= [[BOARD_ACTION_AMOUNT]] => needs_board_action true
- state machine: draft/submitted/under_review/scheduled_for_vote/approved/denied

PHASE 34 — Vote capture v1
- board_votes record: motion/second/votes/result
- link vote to funding request + meeting

PHASE 35 — Expense logging v1
- expenses table + receipt upload
- link to funding request + budget line

PHASE 36 — Budget burn-down
- view: allocated vs spent by budget line
- alerts for overruns

PHASE 37 — Grant cycle v1
- grant_cycles table + open/close dates + max

PHASE 38 — Grant intake
- upload application doc + extract metadata
- state machine: submitted/under_review/approved/denied/awarded/expended

PHASE 39 — Service contract lead-time warnings
- if event needs contract and < lead-time => warning + advisor flag

PHASE 40 — Finance dashboard exports
- monthly snapshot PDF/CSV

PHASE 41 — Clubs registry v1
- clubs table (advisor, constitution doc, membership count)

PHASE 42 — Charter checklist
- per-club checklist statuses (packet complete, advisor form, constitution, etc.)

PHASE 43 — ICC meetings + attendance v1
- icc_meetings + icc_attendance

PHASE 44 — ICC absence/quorum flags
- auto-flag club as “not counted for quorum” when absent per rules
- export attendance list

PHASE 45 — Club funding eligibility v1
- eligibility flags based on requirements (config)

PHASE 46 — Permissions hardening v2
- full permission matrix tests (RLS)
- “break glass” admin-only functions

PHASE 47 — Backups & retention
- export scripts + monthly restore checklist
- storage lifecycle rules

PHASE 48 — Security review pass
- threat model doc
- log review + credential rotation checklist

PHASE 49 — Admin UX polish
- bulk import members
- term rollover tool

PHASE 50 — Launch runbook
- onboarding docs
- “weekly operations checklist”
- support + incident playbook
