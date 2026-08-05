# ASGC Governance Alignment Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Align ASGC OS with the February 27, 2026 ASGC Constitution and Bylaws, with immediate focus on officer identities, office-hour rules, and the admin/reporting logic that depends on them.

**Architecture:** Keep the existing coarse `role_key` buckets for authorization compatibility, but add a structured governance layer on top of them (`governance_key`, `display_title`, `seat_number`, and role-policy helpers) so the app can represent President, Vice President, Secretary, Vice President of Finance, Spring 2026 transitional directors, and numbered Board Member seats without guessing from email addresses. Restore dual-bucket office-hours accounting so weekly total hours and in-office hours can be configured independently again, then drive reminders, exports, and permissions from the structured governance metadata instead of EVP/director string heuristics.

**Tech Stack:** Next.js App Router, TypeScript/JavaScript, Supabase/Postgres migrations + RPCs, Node test runner (`npm test` in `apps/web`)

## Audit Findings

- The February 27, 2026 governing docs define a Board with Executive Officers and At-Large Board Members, with Spring 2026 temporary title conversions and committee-chair exceptions.
- Public ASGC sources are inconsistent as of March 2026:
  - The public board-members and elections pages still show the pre-February 27, 2026 officer structure.
  - The ASGC meetings page and the March 6, 2026 agenda already reflect the President / Vice President / Secretary / numbered Board Member structure.
- The current app only understands `advisor`, `president`, `executive`, `director`, `board_member`, and `volunteer`.
- The current app deliberately removed in-office office-hour enforcement in `supabase/migrations/202601310002_patch_office_hours_single_bucket.sql`.
- Weekly report labels and Board Member numbering are inferred from email addresses instead of stored governance data.
- Admin access and task delegation still assume an EVP/director hierarchy that no longer matches the new governance model cleanly.

## Recommended Direction

- Keep `role_key` as the coarse permission bucket for backward compatibility.
- Add a canonical `governance_key` for the actual office or transitional assignment:
  - `president`
  - `vice_president`
  - `secretary`
  - `vice_president_finance`
  - `director_campus_activities`
  - `director_student_legislation`
  - `director_publicity`
  - `director_board_affairs`
  - `board_member`
  - `student_trustee`
  - `icc_president`
  - `volunteer`
- Add `seat_number` for numbered Board Member seats so labels no longer depend on email local parts.
- Centralize policy in one shared governance catalog instead of spreading hardcoded arrays and label logic across routes, migrations, and report helpers.

### Task 1: Create the governance catalog and remove email-based title guessing

**Files:**
- Create: `apps/web/src/lib/asgc-governance.mjs`
- Create: `apps/web/test/asgc-governance.test.mjs`
- Modify: `apps/web/src/lib/office-hours-weekly-report.mjs`
- Modify: `apps/web/src/app/admin/admin-panel.tsx`
- Modify: `apps/web/src/app/admin/page.tsx`

**Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";

import { formatGovernanceLabel } from "../src/lib/asgc-governance.mjs";

test("formatGovernanceLabel prefers governance key and seat number over email heuristics", () => {
  assert.equal(
    formatGovernanceLabel({ roleKey: "executive", governanceKey: "secretary", seatNumber: null }),
    "Secretary",
  );
  assert.equal(
    formatGovernanceLabel({ roleKey: "board_member", governanceKey: "board_member", seatNumber: 4 }),
    "Board Member 4",
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="formatGovernanceLabel" -v`
Expected: FAIL because `apps/web/src/lib/asgc-governance.mjs` does not exist yet.

**Step 3: Write minimal implementation**

- Add a governance catalog that maps `governance_key` to:
  - public label
  - parent `role_key`
  - Board voting/quorum behavior
  - default office-hours policy bucket
  - whether `seat_number` is required
  - whether the office is Spring 2026 transitional only
- Add helpers like:
  - `formatGovernanceLabel`
  - `normalizeGovernanceAssignment`
  - `roleBucketFromGovernanceKey`
  - `isTransitionalGovernanceKey`
- Update `office-hours-weekly-report.mjs` to prefer structured metadata and only fall back to email parsing for legacy rows during migration.

**Step 4: Wire the catalog into the current admin UI**

- Replace the hardcoded role arrays in the admin panel with catalog-driven labels where possible.
- Keep existing `role_key` filters working, but display the structured office label in the UI.

**Step 5: Run tests**

Run: `npm test -- --test-name-pattern="Governance|Role"`  
Expected: PASS for the new governance-label tests and any updated report-helper tests.

**Step 6: Commit**

```bash
git add apps/web/src/lib/asgc-governance.mjs apps/web/test/asgc-governance.test.mjs apps/web/src/lib/office-hours-weekly-report.mjs apps/web/src/app/admin/admin-panel.tsx apps/web/src/app/admin/page.tsx
git commit -m "feat: add structured ASGC governance catalog"
```

### Task 2: Persist governance identity in the database and admin APIs

**Files:**
- Create: `supabase/migrations/202603070001_governance_identity_v1.sql`
- Modify: `apps/web/src/app/api/admin/role-assignments/route.ts`
- Modify: `apps/web/src/app/api/admin/bootstrap-role-grants/route.ts`
- Modify: `apps/web/src/app/admin/admin-panel.tsx`
- Test: `apps/web/test/asgc-governance.test.mjs`

**Step 1: Write the failing test**

```js
test("normalizeGovernanceAssignment derives role bucket from governance key", () => {
  assert.deepEqual(
    normalizeGovernanceAssignment({ governanceKey: "secretary", seatNumber: null }),
    { roleKey: "executive", governanceKey: "secretary", seatNumber: null },
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="normalizeGovernanceAssignment" -v`
Expected: FAIL because the helper has not been implemented yet.

**Step 3: Write the migration**

- Add nullable `governance_key` and `seat_number` columns to:
  - `public.role_assignments`
  - `public.bootstrap_role_grants`
- Add constraints:
  - `seat_number` required only when `governance_key = 'board_member'`
  - `seat_number` must be positive when present
  - `governance_key` must be one of the supported catalog values
- Backfill existing rows using current data:
  - `president` role -> `governance_key = 'president'`
  - executive rows with `display_title` matching secretary / EVP / VP Finance -> corresponding governance key
  - director rows with `display_title` -> specific transitional director key when possible
  - `board_member` rows -> `governance_key = 'board_member'`
- Do not delete legacy rows; make the migration additive.

**Step 4: Update admin write paths**

- Allow role-assignment creation to accept `governanceKey`, `seatNumber`, and `displayTitle` for any term-scoped row.
- Keep the server as the source of truth by deriving `role_key` from `governance_key` instead of trusting client input.
- Update the admin panel so assigning a Board Member requires a seat number and assigning a transitional title stores the matching governance key explicitly.

**Step 5: Validate the migration and tests**

Run: `supabase db push --dry-run`  
Expected: migration parses cleanly and shows the new governance-identity patch.

Run: `npm test -- --test-name-pattern="Governance" -v`  
Expected: PASS for governance normalization tests.

**Step 6: Commit**

```bash
git add supabase/migrations/202603070001_governance_identity_v1.sql apps/web/src/app/api/admin/role-assignments/route.ts apps/web/src/app/api/admin/bootstrap-role-grants/route.ts apps/web/src/app/admin/admin-panel.tsx apps/web/test/asgc-governance.test.mjs
git commit -m "feat: persist ASGC governance identity"
```

### Task 3: Restore dual-bucket office hours and support the new officer-hour policy

**Files:**
- Create: `supabase/migrations/202603070002_restore_dual_bucket_office_hours.sql`
- Modify: `apps/web/src/app/api/admin/office-hour-requirements/route.ts`
- Modify: `apps/web/src/app/admin/admin-panel.tsx`
- Modify: `apps/web/src/app/office-hours/page.tsx`
- Modify: `apps/web/src/app/api/admin/office-hours/export-week/route.ts`
- Modify: `apps/web/src/app/api/cron/office-hours-reminders/route.ts`
- Test: `apps/web/test/office-hours-weekly-report.test.mjs`

**Step 1: Write the failing test**

```js
test("hoursStatusLabel keeps separate total and in-office deficits", () => {
  const row = {
    required_hours: 6,
    total_hours: 6,
    missing_hours: 0,
    required_in_office_hours: 4,
    in_office_hours: 2,
    missing_in_office_hours: 2,
  };

  assert.equal(describeOfficeHoursDeficit(row), "2h in-office remaining");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="in-office" -v`
Expected: FAIL because the current app collapses all office-hour minutes into one bucket.

**Step 3: Write the migration**

- Remove the `weekly_in_office_hours = 0` constraint added by `202601310002_patch_office_hours_single_bucket.sql`.
- Restore `office_hour_exceptions.kind in ('total','in_office')`.
- Update `my_weekly_hours` and `admin_weekly_hours` to compute:
  - total minutes
  - in-office minutes
  - total deficit
  - in-office deficit
- Preserve `admin_exclude_from_totals` support from the later override patch.

**Step 4: Update app and admin UI**

- Let the admin UI edit both:
  - `weekly_total_hours`
  - `weekly_in_office_hours`
- Update the requirement API so it stops forcing `weekly_in_office_hours: 0`.
- Update member dashboards, admin exports, and reminders to surface both kinds of deficit when present.
- Add term defaults for the current policy once decided:
  - Board Members: total weekly hours with a required in-office floor of 4.
  - President / Vice President / Secretary: `10 flat` once that phrase is resolved into a concrete rule.

**Step 5: Validate**

Run: `supabase db push --dry-run`  
Expected: migration parses cleanly and replaces the single-bucket behavior.

Run: `npm test -- --test-name-pattern="office-hours|weekly-report" -v`  
Expected: PASS for updated weekly-report helpers and office-hours tests.

**Step 6: Commit**

```bash
git add supabase/migrations/202603070002_restore_dual_bucket_office_hours.sql apps/web/src/app/api/admin/office-hour-requirements/route.ts apps/web/src/app/admin/admin-panel.tsx apps/web/src/app/office-hours/page.tsx apps/web/src/app/api/admin/office-hours/export-week/route.ts apps/web/src/app/api/cron/office-hours-reminders/route.ts apps/web/test/office-hours-weekly-report.test.mjs
git commit -m "feat: restore dual-bucket office hours"
```

### Task 4: Replace EVP/director-specific permission logic with governance-driven rules

**Files:**
- Create: `supabase/migrations/202603070003_governance_permissions_patch.sql`
- Modify: `apps/web/src/lib/adminAuth.ts`
- Modify: `apps/web/src/app/api/tasks/assignees/route.ts`
- Modify: `apps/web/src/app/api/admin/office-hours/export-week/route.ts`
- Test: `apps/web/test/asgc-governance.test.mjs`

**Step 1: Write the failing test**

```js
test("governance permissions do not depend on EVP string matching", () => {
  assert.equal(canManageOfficeHours({ governanceKey: "vice_president" }), true);
  assert.equal(canManageOfficeHours({ governanceKey: "secretary" }), false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="permissions do not depend on EVP" -v`
Expected: FAIL because admin access is still tied to `executive` plus `display_title` text matching.

**Step 3: Write minimal implementation**

- Add governance-policy helpers for:
  - admin tier
  - meetings/docs access
  - office-hours admin access
  - task delegation
- Update `get_admin_tier` and related route guards to read structured governance metadata instead of checking for `is_evp`.
- Update task delegation logic so it follows the governance catalog rather than the old `executive > director > board_member` ladder.
- Preserve Spring 2026 temporary exceptions by expressing them as dated governance-policy rules, not one-off string matches.

**Step 4: Validate**

Run: `supabase db push --dry-run`  
Expected: new permission patch parses cleanly.

Run: `npm test -- --test-name-pattern="permissions|delegate|Governance" -v`  
Expected: PASS for the new governance-permission tests.

**Step 5: Commit**

```bash
git add supabase/migrations/202603070003_governance_permissions_patch.sql apps/web/src/lib/adminAuth.ts apps/web/src/app/api/tasks/assignees/route.ts apps/web/src/app/api/admin/office-hours/export-week/route.ts apps/web/test/asgc-governance.test.mjs
git commit -m "feat: align ASGC permissions with governance roles"
```

## Policy Questions To Resolve Before Implementation

1. Does `10 flat` for President, Vice President, and Secretary mean:
   - 10 total hours regardless of where they are worked, or
   - 10 in-office hours, or
   - 10 total hours with no committee-hour substitution?
2. Should the Secretary have any office-hours admin power, or should Secretary access stay limited to meetings, agendas, minutes, and attendance reporting?
3. For Spring 2026, do you want the app to actively model the transitional director titles until the Fall 2026 seating, or only preserve them for historical display while the live roster moves to the new President / Vice President / Secretary / Board Member structure?
4. Do you want Student Trustee and ICC President represented in the app now, even if they remain non-voting/advisory for most internal features?

## Suggested Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4

The app cannot safely implement the new office-hours policy until Tasks 1 and 2 exist, because the current system still relies on generic role buckets and email-derived titles.
