# Office Hours Allowed Days Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Let admins configure which days/dates Office Hours check-ins are allowed (default Mon–Fri), with a one-click “Allow weekends” shortcut for testing.

**Architecture:** Store policy in `public.office_config` (singleton): allowed weekdays array, allow-weekends boolean, and extra allowed dates array. Enforce in DB for signed-in check-ins and admin shift creation; reuse the same DB policy from kiosk check-in via an admin RPC call.

**Tech Stack:** Supabase Postgres migrations + Next.js (app router) admin UI + Supabase RPC.

---

### Task 1: Add config columns + policy function (DB)

**Files:**
- Create: `supabase/migrations/202602010002_patch_office_hours_allowed_days.sql`

**Step 1: Add columns**
- Add `office_hours_allow_weekends boolean not null default false`
- Add `office_hours_allowed_weekdays int[] not null default '{1,2,3,4,5}'`
- Add `office_hours_extra_allowed_dates date[] not null default '{}'`
- Add constraints: weekdays in 1..7, at least one weekday, unique weekday values, unique dates.

**Step 2: Add function**
- Create `public.is_office_hours_day_allowed(_ts timestamptz default now()) returns boolean` (security definer, stable).
- Logic:
  - `tz := public.office_timezone()`
  - `dow := extract(isodow from (_ts at time zone tz))::int`
  - `day := (_ts at time zone tz)::date`
  - Allow if `office_hours_allow_weekends` OR `dow` in `office_hours_allowed_weekdays` OR `day` in `office_hours_extra_allowed_dates`.

**Step 3: Patch enforcement points**
- Patch `public.check_in_office_hours(...)` to use `is_office_hours_day_allowed(now())` and raise `weekend_not_allowed` when false.
- Patch `public.admin_create_office_hour_shift(...)` to reject when start/end are not allowed days.

---

### Task 2: Wire admin API to read/write new fields

**Files:**
- Modify: `apps/web/src/app/api/admin/office-config/route.ts`

**Steps:**
- Include the new `office_config` fields in `select(...)` and in the returned JSON.
- Accept `office_hours_allow_weekends`, `office_hours_allowed_weekdays`, `office_hours_extra_allowed_dates` in PUT.
- Validate:
  - weekdays: array of ints 1..7 with no duplicates, at least one.
  - dates: array of `YYYY-MM-DD` strings (convert to `date[]` update).

---

### Task 3: Add Admin UI controls

**Files:**
- Modify: `apps/web/src/app/admin/page.tsx` (server preload select list)
- Modify: `apps/web/src/app/admin/admin-panel.tsx`

**Steps:**
- Extend `OfficeConfigRow` types with new fields.
- Add “Office hours availability” section:
  - Toggle “Allow weekends (testing)”.
  - Weekday checkboxes (Mon–Sun) → updates `office_hours_allowed_weekdays`.
  - “Extra allowed dates” date input + Add button; list existing dates with Remove.
- Ensure Save button includes these fields in payload and baseline diff logic includes them.

---

### Task 4: Enforce the policy in kiosk check-in + improve messaging

**Files:**
- Modify: `apps/web/src/app/api/office-hours/kiosk/check-in/route.ts`
- Modify: `apps/web/src/app/office-hours/page.tsx`
- Modify: `apps/web/src/app/office-hours/check-in/page.tsx`
- Modify: `apps/web/src/app/office-hours/kiosk/page.tsx`
- Modify: `apps/web/src/app/admin/admin-panel.tsx` (shift creation error message copy)

**Steps:**
- Replace kiosk’s weekend check with `admin.rpc("is_office_hours_day_allowed")`; on false return `weekend_not_allowed` (for backwards compatibility).
- Update user-facing copy for `weekend_not_allowed` to “Office hours aren’t enabled today.”

---

### Task 5: Tests + build verification

**Files:**
- Add/Modify: `apps/web/test/...` (as needed)

**Steps:**
- Add a small unit test for weekday/date parsing/validation helpers (client-side), if new helpers added.
- Run: `npm test` in `apps/web` (expect PASS)
- Run: `npm run build` in `apps/web` (expect success)
