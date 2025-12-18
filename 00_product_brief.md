# 00_product_brief.md
Status: DRAFT / For Board Consideration (internal system build packet, not public)

## 0) One-sentence summary
Build **ASGC OS**: a private internal “work operating system” for student government to manage office hours, tasks/projects, committees, meetings (agenda/minutes), finance (requests/expenses/grants), and clubs/ICC ops — with audit trails + optional AI helpers.

## 1) What success looks like (non-negotiable outcomes)
- Office-hours compliance can be reviewed in <5 minutes/week (dashboard + digest).
- No more “who’s doing what?” confusion: tasks and ownership are always visible.
- Every funding request has purpose + breakdown + attachments, and approvals are traceable.
- Minutes/committee notes are uploaded, searchable, and can auto-generate tasks (draft).
- Permissions are safe by default (no sensitive records exposed to the wrong people).

## 2) Audience & personas
Primary:
- President (overall ops + accountability + dashboard)
- EVP / Exec officers (committee coordination)
- VP Finance (budget + requests + expenses + grant cycles)
- Directors / Board members (tasks, meetings, office hours)
- Advisor (oversight + approvals + admin override)

Optional extension:
- Clubs + ICC reps (club chartering + ICC attendance + forms)

## 3) What this system is NOT (explicit non-goals)
- Not a public transparency website (that can be Phase 30+ export only).
- Not payroll/HR in the legal sense (no pay, no employment classification).
- Not a surveillance tool: only minimal “presence proof” is collected.
- Not a replacement for Board votes/approvals: it records them, doesn’t invent them.

## 4) Core modules (MVP)
A) Identity + Roles
- Invite-only accounts
- Role/term assignments
- Committee membership

B) Office Hours (highest priority)
- Mobile check-in/out
- Geofence + periodic location verification
- Weekly totals vs role requirements
- Reminders + weekly deficit digest
- Coverage workflow + exceptions (approved)

C) Tasks/Projects
- Kanban tasks
- Due dates, owners, committee/project grouping
- Comments + attachments
- “Action items from minutes” (draft)

D) Meetings + Docs
- Meeting calendar (Board + committees + ICC)
- Agenda item submission + deadline tracking
- Minutes upload + versioning
- Committee notes upload space
- Optional AI: summary + extract tasks (always DRAFT)

E) Finance
- Funding request form w/ breakdown + attachments
- Threshold routing (≥$100 → Board action)
- Vote capture (motion/second/votes)
- Expenses + receipts linked back to requests
- Grant cycle intake + tracking

F) Clubs/ICC (optional MVP, but planned)
- Club registry (advisor, constitution on file, membership count)
- ICC attendance tracking + flags
- Charter checklist tracking

## 5) Default policy knobs (config, not hardcoded)
(Everything below must be editable in-admin without redeploy.)

Office hours / weekly minimums (defaults you can override by term):
- President: [[PRES_WEEKLY_TOTAL_HRS]] total; [[PRES_WEEKLY_INOFFICE_HRS]] in-office
- Exec officers: [[EXEC_WEEKLY_TOTAL_HRS]] total; [[EXEC_WEEKLY_INOFFICE_HRS]] in-office
- Board members: [[BOARD_WEEKLY_TOTAL_HRS]] total; [[BOARD_WEEKLY_INOFFICE_HRS]] in-office
- Volunteers/Ambassadors: [[VOL_WEEKLY_TOTAL_HRS]] total; [[VOL_WEEKLY_INOFFICE_HRS]] in-office
- “On Behalf” formula / cap: configurable

Meeting deadlines:
- Agenda submission cutoff hours: [[AGENDA_SUBMIT_HRS_BEFORE]] (default 84)
- Regular agenda posting hours: [[AGENDA_POST_HRS_BEFORE]] (default 72)
- Special agenda posting hours: [[SPECIAL_POST_HRS_BEFORE]] (default 24)

Finance thresholds:
- Board action threshold: [[BOARD_ACTION_AMOUNT]] (default 100)
- Grant max amount: [[GRANT_MAX]] (default 1000)
- Service-contract lead time warning days: [[SERVICE_CONTRACT_WARN_DAYS]] (default 42)

## 6) Data sensitivity levels (privacy + permissions)
Level 0 (safe): tasks titles, committee rosters, public-ish meeting metadata
Level 1 (internal): minutes, committee notes, internal discussions
Level 2 (restricted): finance requests/receipts/contracts
Level 3 (highly restricted): office-hour dispute notes, exception reasons, discipline-related tracking

## 7) “AI use” rules (guardrails)
- AI outputs are always labeled **DRAFT**.
- AI never finalizes official minutes/agendas/votes.
- AI suggestions must be editable and require a human “Approve” click.
- AI prompts are stored (for auditability) but redacted of sensitive info.

## 8) MVP user stories (you can hand to an AI coder)
Office hours:
- As a member, I can check-in/out from my phone within 30 seconds.
- As President/Advisor, I can see who is checked in right now.
- As President, I get a weekly digest of who is short on hours.

Docs:
- As a committee chair, I can upload notes and restrict them to my committee.
- As a board member, I can upload minutes and attach them to a meeting record.
- As a user, I can search docs by title/tags and download.

Tasks:
- As a chair, I can assign tasks with due dates and see overdue items.
- As a member, I can comment and attach files to a task.

Finance:
- As a requestor, I can submit a funding request with breakdown + quotes.
- As VP Finance, I can route it to Board vote if needed and later log expenses.

## 9) Fill-ins needed (replace before building)
- [[ASGC_OFFICE_NAME]] ASGC Office
- [[OFFICE_LAT]], [[OFFICE_LON]] 32.81593281439648, -117.00536905212395
- [[OFFICE_RADIUS_M]] 20m
- [[OFFICE_GRACE_RADIUS_M]] 40m
- [[ALLOWED_EMAIL_DOMAINS]] gcccd.edu
- [[ADVISOR_EMAILS]]
- [[QUIET_HOURS_LOCAL]] (default 9pm–8am)
- [[TIMEZONE]] (default America/Los_Angeles)

## 10) How to use this packet with an AI coding agent
- You will paste **all 5 files** into the agent context.
- The agent must build strictly phase-by-phase (see Architecture doc).
- Each phase must produce:
  1) migrations
  2) API/functions
  3) UI pages
  4) tests
  5) a demo checklist
- If missing info: agent must add TODO placeholders, not invent rules.
