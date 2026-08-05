# Office Hours Single-Bucket (No In-Office vs On-Behalf) Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Remove the “in-office” requirement and “on-behalf” split so office hours are a single simple total, without breaking existing data or workflows.

**Architecture:** Keep geofence/presence enforcement as-is, but change requirement, exception, reporting, and reminder logic to treat all minutes equally. Preserve compatibility fields in RPCs where needed, but make them redundant (`in_office_minutes == total_minutes`, `deficit_in_office_minutes == 0`) and remove the UI affordances that expose the split.

**Tech Stack:** Supabase Postgres migrations (SQL/PLpgSQL), Next.js App Router (React), Tailwind.

---

### Task 1: Decide compatibility strategy (no breaking schema)

**Files:**
- Modify: `supabase/migrations/*` (new patch migration)

**Steps:**
1. Keep existing columns (e.g. `weekly_in_office_hours`, `office_hour_exceptions.kind`) but enforce policy:
   - `weekly_in_office_hours` must be `0`
   - exceptions `kind` must be `'total'`
2. Keep RPC return shapes for compatibility:
   - `in_office_minutes` mirrors `total_minutes`
   - `deficit_in_office_minutes` is always `0`

**Verification:**
- Review existing code references to ensure no runtime break.

---

### Task 2: Write DB migration to enforce single-bucket policy

**Files:**
- Create: `supabase/migrations/202601310001_patch_office_hours_single_bucket.sql`

**Steps:**
1. Data migration:
   - `update public.office_hour_exceptions set kind = 'total' where kind = 'in_office';`
   - `update public.office_hour_requirements set weekly_in_office_hours = 0 where weekly_in_office_hours <> 0;`
2. Constraints:
   - Replace exceptions kind constraint to allow only `'total'`.
   - Add a constraint `office_hour_requirements_in_office_is_zero` enforcing `weekly_in_office_hours = 0`.
3. RPCs:
   - `my_weekly_hours(_week_start date default null)` → compute in-office minutes as total, deficits only total.
   - `admin_weekly_hours(_week_start date default null)` → same semantics.
   - `enqueue_weekly_hours_reminders(_now timestamptz default now())` → only total deficit candidates, store only total fields in metadata.

**Verification:**
- Apply migration locally if possible, or run `supabase db push` to remote.

---

### Task 3: Update cron email content to match single-bucket

**Files:**
- Modify: `apps/web/src/app/api/cron/office-hours-reminders/route.ts`

**Steps:**
1. Update `renderEmailText` for `office_hours.weekly_hours_reminder` to remove in-office lines.
2. Keep parsing tolerant of missing metadata keys (don’t crash if older queued records exist).

**Verification:**
- `npm test` in `apps/web`
- `npm run build` in `apps/web`

---

### Task 4: Simplify member UI to show only total office hours

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/office-hours/page.tsx`

**Steps:**
1. Remove “In office” and “On-behalf” copy and numbers from member views.
2. Keep progress display only for total progress.

**Verification:**
- Typecheck + build.

---

### Task 5: Simplify admin UI/export to remove in-office concepts

**Files:**
- Modify: `apps/web/src/app/admin/admin-panel.tsx`
- Modify: `apps/web/src/app/admin/office-hours/export/office-hours-export-panel.tsx`
- Modify: `apps/web/src/app/api/admin/office-hours/export-week/route.ts`

**Steps:**
1. Remove in-office columns and sort option(s) from tables/exports.
2. Keep the API compatible if needed, but prefer not to export redundant columns.

**Verification:**
- `npm test`, `npm run build` in `apps/web`

---

### Task 6: Rollout checklist

**Steps:**
1. Deploy web (Vercel) after push to `main`.
2. Ensure Supabase migration is applied.
3. Re-run cron job and confirm reminder email contains only total metrics.
