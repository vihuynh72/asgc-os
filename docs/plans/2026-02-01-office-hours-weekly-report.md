# Office Hours Weekly Report Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Produce an HR-readable weekly office hours report (role + name hierarchy, progress, and clear “missing vs complete”) with a clean CSV export.

**Architecture:** Keep weekly totals computed in Supabase via `admin_weekly_hours`; the Next.js route `/api/admin/office-hours/export-week` enriches rows and provides both JSON (for UI) and CSV (for spreadsheets). The UI renders a grouped report view (President → Executives → Directors → Board Members) and a CSV page that also offers report/table/raw modes.

**Tech Stack:** Next.js App Router, Supabase RPC, Tailwind UI primitives, Node test runner (`node --test`).

### Task 1: Shared report utilities

**Files:**
- Create: `apps/web/src/lib/office-hours-weekly-report.mjs`
- Test: `apps/web/test/office-hours-weekly-report.test.mjs`

**Steps:**
1. Implement role labeling from `role_key` + email local-part hints (VP Finance, Board Member #).
2. Implement deterministic sorting by `role_key` hierarchy (never by role label substring).
3. Add tests verifying President is ordered above “Vice President …” and board members sort by number.

### Task 2: Export API (JSON + CSV)

**Files:**
- Modify: `apps/web/src/app/api/admin/office-hours/export-week/route.ts`

**Steps:**
1. Include `role_key` and `needs_review_sessions` in JSON rows.
2. Sort using the shared sorter.
3. Emit CSV with human-friendly headers and no `user_id` column.

### Task 3: Weekly report UI (admin)

**Files:**
- Modify: `apps/web/src/app/admin/office-hours/export/office-hours-export-panel.tsx`
- Modify: `apps/web/src/app/admin/office-hours/export/page.tsx`

**Steps:**
1. Render grouped sections (President/Executives/Directors/Board Members).
2. Add summary totals, progress bars, and status pills (Complete/Behind/Missing).
3. Add simple filters (search + “show missing only”) and export actions.

### Task 4: CSV page UI

**Files:**
- Modify: `apps/web/src/app/admin/office-hours/export/csv/office-hours-csv-panel.tsx`
- Modify: `apps/web/src/app/admin/office-hours/export/csv/page.tsx`

**Steps:**
1. Default to “Report” mode (same grouped view); keep “Table” and “Raw” modes for CSV handling.
2. Add copy/download/open-report actions.

### Task 5: Verification

**Steps:**
1. Run tests: `cd apps/web && npm test`
2. Run build/typecheck: `cd apps/web && npm run build`
