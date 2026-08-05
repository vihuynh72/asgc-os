# Office Hours Selfie Review Workflow Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Make kiosk selfie review fast and safe: easy access from Office Hours, richer context, and admin “Quarantine / Restore” actions (recoverable for 30 days).

**Architecture:** Store selfie lifecycle state on `office_hour_sessions`. Quarantine physically moves the file in Supabase Storage to a `kiosk-quarantine/…` path, records metadata (`quarantined_at/by`, quarantine path), and sets `kiosk_checkin_photo_deleted_at` (so normal viewers no longer show it). Restore moves the file back to the original path and clears `deleted_at`.

**Tech Stack:** Supabase migrations + Next.js route handlers + Supabase Storage `move()` + React admin UI (Tailwind).

---

### Task 1: Add DB columns for quarantine lifecycle

**Files:**
- Create: `supabase/migrations/202602010004_patch_office_hours_kiosk_photo_quarantine.sql`

**Steps:**
- Add columns on `public.office_hour_sessions`:
  - `kiosk_checkin_photo_quarantine_bucket text null`
  - `kiosk_checkin_photo_quarantine_path text null`
  - `kiosk_checkin_photo_quarantined_at timestamptz null`
  - `kiosk_checkin_photo_quarantined_by uuid null`
  - `kiosk_checkin_photo_quarantine_reason text null`
  - `kiosk_checkin_photo_restored_at timestamptz null`
  - `kiosk_checkin_photo_restored_by uuid null`
- Add an index for quarantine queries (by `checkin_at` and state).

---

### Task 2: Add quarantine/restore API routes (secure + audited)

**Files:**
- Create: `apps/web/src/app/api/office-hours/kiosk/review/quarantine/route.ts`
- Create: `apps/web/src/app/api/office-hours/kiosk/review/restore/route.ts`
- Create: `apps/web/src/lib/office-hours-kiosk-photo.mjs`
- Test: `apps/web/test/office-hours-kiosk-photo.test.mjs`

**Steps:**
- Use `requireFullAdminOrEvp` for write actions (reviewers can view, but only admins can quarantine/restore).
- Validate target session is allowlisted, has photo, and is in correct state.
- Quarantine:
  - Move file from original path to quarantine path (same bucket) via Storage `move()`.
  - Update DB fields + set `kiosk_checkin_photo_deleted_at`.
  - Log `audit_log` event `office_hours.kiosk_photo_quarantined`.
- Restore:
  - Only allow if quarantined within 30 days and quarantine path exists.
  - Move file back to original path.
  - Clear `kiosk_checkin_photo_deleted_at`, set restored fields.
  - Log `audit_log` event `office_hours.kiosk_photo_restored`.

---

### Task 3: Upgrade selfie review UI (fast + “management”)

**Files:**
- Modify: `apps/web/src/app/office-hours/kiosk/review/review-panel.tsx`
- Modify: `apps/web/src/app/api/office-hours/kiosk/review/sessions/route.ts`

**Steps:**
- Add two tabs: **Active** and **Quarantine** (loads different server mode).
- Show richer metadata per session:
  - Office-tz formatted check-in time
  - Status + duration
  - In-radius / distance badges
- Add actions:
  - View selfie (signed URL)
  - Quarantine (with reason input + confirm)
  - Restore (Quarantine tab)
  - Bulk select + bulk quarantine/restore

---

### Task 4: Add “easy access” entry points

**Files:**
- Modify: `apps/web/src/app/office-hours/page.tsx`
- Modify: `apps/web/src/app/admin/office-hours/admin-office-hours-panel.tsx` (if needed)

**Steps:**
- Add an “Selfies” entry point on Office Hours page when the user can view photos.
- Keep existing Admin button and inline viewer.

---

### Task 5: Verification

**Steps:**
- Run `npm test` in `apps/web` (expect PASS)
- Run `npm run build` in `apps/web` (expect success)
