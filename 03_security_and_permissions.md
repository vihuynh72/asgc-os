# 03_security_and_permissions.md
Status: DRAFT / Security + permissions (RLS-first)

## 0) Security posture
- Invite-only authentication
- Role + committee scoped access
- RLS is authoritative (not just UI hiding)
- All sensitive actions produce audit_log entries

## 1) Roles (system roles)
- ADVISOR (super-admin)
- PRESIDENT
- EXECUTIVE (EVP, VP Finance, etc.)
- DIRECTOR
- BOARD_MEMBER
- VOLUNTEER
- AMBASSADOR
Derived:
- COMMITTEE_CHAIR (from committees.chair_user_id)

## 2) Permission matrix (v1)
People directory:
- Everyone: read limited fields (name, role, committee)
- President/Advisor: manage invites + role assignments

Office hours:
- User: read/write own sessions; cannot edit closed sessions
- President/Advisor: read all; admin-close; approve/void disputed sessions
- Exec: read all (optional), no admin-close unless delegated

Tasks/projects:
- Committee members: read/write tasks in their committee
- Committee chair: can assign within committee
- President/Advisor: global override

Docs:
- internal: readable by members
- restricted: only exec/President/Advisor
- finance receipts/contracts: Executives (VP Finance) + President + Advisor
- delete: soft-delete only, with audit log

Finance:
- funding_requests: requestor drafts/submits; executives manage; Board records votes
- expenses: executives create/update; Advisor approves if needed
- grants: intake + advisor approval flags

Clubs/ICC:
- if enabled: club module users are separate access tier (optional)

## 3) RLS policy patterns (examples)
- profiles: users can read limited directory; only admin can read phone fields
- office_hour_session:
  - SELECT: user_id = auth.uid() OR is_role(uid,'PRESIDENT') OR is_role(uid,'ADVISOR')
  - INSERT: user_id must equal auth.uid() unless admin
  - UPDATE: only edge functions can close sessions (preferred), or user can close own open session
- funding_requests:
  - requestor can read/write own drafts
  - executives can read/write all
  - President/Advisor read all

## 4) Audit requirements (must log)
- Role changes
- Invite created/revoked
- Office hours: check-in, check-out, admin-close, disputed->approved/void
- Finance: request submitted, state transition, vote recorded, expense created/edited
- Docs: upload, replace version, delete

## 5) Location privacy rules (non-negotiable)
- Store distance meters + within_geofence boolean
- Do NOT store raw coordinates long-term
- If raw coords are temporarily stored for debugging:
  - 7-day retention
  - Advisor-only access
  - encrypted at rest

## 6) Anti-fraud approach (office hours)
- Geofence + rotating token
- Anomaly flags:
  - repeated failed tokens
  - too many grace-range checkins
  - excessively long sessions
- “Flags” never auto-discipline; they only prompt review.

## 7) Secret management
- Never store API keys in client code
- AI keys + email keys only in server/edge function env
- Rotate quarterly (or per term)

## 8) Backup & recovery (solo runbook)
- Monthly DB export + “restore test” checklist
- Storage bucket lifecycle rules
- Separate owner/admin account for project ownership
