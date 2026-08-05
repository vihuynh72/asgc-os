# Phase 41-50 Demo + Acceptance Checklists

> **Historical evidence notice:** These are acceptance criteria recorded during the phased build. An item describes what should be demonstrated; it does not prove the check was run or passed. Use current code, applied migrations, automated checks, and a dated test record for present release evidence.

## Phase 41 - Clubs registry v1
Demo checklist:
- Create a club record with advisor info and membership counts.
- Upload a constitution and link it to the club.

Acceptance checks:
- Admin-only writes; authenticated users can read.
- Constitution uploads create docs with `doc_type=constitution`.
- Audit log entries exist for club CRUD.

## Phase 42 - Charter checklist
Demo checklist:
- Mark checklist items complete for a club.
- Verify charter completion summary updates.

Acceptance checks:
- Checklist items are configurable and ordered.
- Admin-only edits; authenticated read.
- Charter completion derives from required items.

## Phase 43 - ICC meetings + attendance v1
Demo checklist:
- Create an ICC meeting and mark advisor present.
- Record attendance (present/absent/excused) for a club.

Acceptance checks:
- Attendance recorded at call-to-order.
- Only admins can edit meetings and attendance.
- Attendance updates are auditable.

## Phase 44 - ICC absence/quorum flags
Demo checklist:
- Record multiple absences and verify warning/suspension/revocation flags.
- Export attendance CSV for a meeting.

Acceptance checks:
- Quorum uses 50% + 1 of membership and excludes excused clubs.
- Suspended clubs are not counted for quorum.
- Export includes all clubs with attendance status.

## Phase 45 - Club funding eligibility v1
Demo checklist:
- Update member counts and benefit card counts.
- Verify eligibility status and reasons in Clubs UI.

Acceptance checks:
- Benefit card rule uses 2/3 or 17 (whichever is lower).
- Eligibility requires charter + constitution (configurable).
- Eligibility is recomputed on club/checklist updates.

## Phase 46 - Permissions hardening v2
Demo checklist:
- Verify break-glass functions are service-role only.
- Validate RLS matrix checklist is documented.

Acceptance checks:
- No client-side bypass paths for admin-only tables.
- Break-glass actions are audit logged.

## Phase 47 - Backups & retention
Demo checklist:
- Run backup script and verify artifacts.
- Review restore checklist and storage lifecycle notes.

Acceptance checks:
- DB schema + data exports are scripted.
- Monthly restore steps are documented.
- Storage bucket retention policies are documented.

## Phase 48 - Security review pass
Demo checklist:
- Review threat model and log review checklist.
- Verify credential rotation checklist steps.

Acceptance checks:
- Threat model includes core data flows + risks.
- Log review cadence and owners are defined.

## Phase 49 - Admin UX polish
Demo checklist:
- Bulk import members into allowlist + optional role.
- Run term rollover and set current term.

Acceptance checks:
- Bulk import writes allowlist and role grants.
- Term rollover copies assignments and optionally ends prior term.

## Phase 50 - Launch runbook
Demo checklist:
- Review onboarding + weekly ops checklist.
- Review support/incident playbook.

Acceptance checks:
- Runbook is complete and references configs/scripts.
- Ops checklist includes finance + ICC + office hours.
