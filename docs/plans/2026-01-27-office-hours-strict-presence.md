# Office Hours Strict Presence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Enforce Office Hours presence reliably even if the user closes the tab by using 10-minute location heartbeats and server-side auto-checkout after 60 minutes without a successful heartbeat (excluding kiosk sessions).

**Architecture:** While a session is open, the browser periodically sends a geolocation heartbeat to a new API route. The server records `last_presence_at` when within the office geofence and immediately checks out the user if they leave. A scheduled job calls `/api/cron/office-hours-reminders` to run server-side enforcement to auto-checkout sessions that have not produced a successful heartbeat within 60 minutes.

**Tech Stack:** Next.js (App Router), Supabase Postgres (RLS + RPCs), scheduled HTTP cron (GitHub Actions or Vercel Cron Jobs).

---

### Task 1: Cron auth helper (Vercel-compatible)

**Files:**
- Create: `apps/web/src/lib/cron-auth.mjs`
- Test: `apps/web/test/cron-auth.test.mjs`

**Step 1: Write failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedCronRequest } from "../src/lib/cron-auth.mjs";

test("cron auth accepts Bearer token match", () => {
  assert.equal(
    isAuthorizedCronRequest({ authorization: "Bearer abc" }, { cronSecret: "abc" }),
    true
  );
});
```

**Step 2: Run tests and verify RED**

Run: `npm test test/cron-auth.test.mjs`
Expected: FAIL (module/function missing)

**Step 3: Implement minimal helper**

- Implement `isAuthorizedCronRequest(headers, { cronSecret })`:
  - Accept `Authorization: Bearer <CRON_SECRET>` (Vercel docs default).
  - Keep backwards-compat support for `x-cron-secret` if present (optional).

**Step 4: Run tests and verify GREEN**

Run: `npm test test/cron-auth.test.mjs`
Expected: PASS

---

### Task 2: DB migration — presence columns + RPCs

**Files:**
- Create: `supabase/migrations/202601270001_patch_office_hours_presence_heartbeat.sql`

**Step 1: Add columns**
- `office_hour_sessions.requires_presence boolean not null default true`
- `office_hour_sessions.last_presence_at timestamptz null`

**Step 2: Backfill**
- Set `last_presence_at = checkin_at` for currently-open sessions where it is `null` (so enforcement starts cleanly).

**Step 3: Add RPC `record_office_hours_presence(_lat,_lon)`**
- Authenticated user only (`auth.uid()`).
- If within grace radius: update `last_presence_at = now()` and return `{ action: 'ok' }`.
- If outside grace: close session (same table update as checkout), return `{ action: 'checked_out' }`.
- Do not write audit log entries for successful heartbeats (to avoid noise).
- Write a single audit log entry if the function performs an auto-checkout due to leaving geofence.

**Step 4: Add RPC `auto_checkout_stale_presence(_now default now())`**
- Service role only.
- Close any open session where `requires_presence = true` and `coalesce(last_presence_at, checkin_at) <= _now - interval '60 minutes'`.
- Insert an audit log entry per session closed with reason `presence_timeout` and `timeout_minutes=60`.

**Step 5: Patch `check_in_office_hours`**
- Ensure new sessions set `last_presence_at = now()` on insert.

---

### Task 3: Presence heartbeat API route

**Files:**
- Create: `apps/web/src/app/api/office-hours/presence/route.ts`

**Steps:**
1. Validate user is authenticated.
2. Parse body `{ lat, lon }` with zod.
3. Call `supabase.rpc("record_office_hours_presence", { _lat: lat, _lon: lon })`.
4. Return JSON `{ action, session_id }` and map common errors (`unauthorized`, `no_open_session`, `location_required`, config errors).

---

### Task 4: Cron enforcement + Vercel auth

**Files:**
- Modify: `apps/web/src/app/api/cron/office-hours-reminders/route.ts`
- Modify: `apps/web/src/lib/envServer.ts` (only if needed)

**Steps:**
1. Swap cron auth to `Authorization: Bearer ${process.env.CRON_SECRET}` using `cron-auth.mjs`.
2. Call `auto_checkout_stale_presence` near the start of the handler.
3. Keep existing reminder + auto-close logic intact.

---

### Task 5: Client heartbeat behavior (10-minute interval)

**Files:**
- Modify: `apps/web/src/app/office-hours/page.tsx`
- Modify: `apps/web/src/components/office-hours-presence-monitor.tsx`
- Modify: `apps/web/src/app/api/office-hours/kiosk/check-in/route.ts`

**Steps:**
1. Change interval from 30 minutes → 10 minutes in both client monitors.
2. Replace automatic `/api/office-hours/check-out` calls with `/api/office-hours/presence`:
   - This both updates `last_presence_at` and checks out if outside grace.
3. Ensure the first heartbeat runs immediately on resume/mount.
4. Mark kiosk-created sessions as `requires_presence = false` so they are excluded from presence enforcement.

---

### Task 6: Scheduled job config

**Files:**
- Create: `.github/workflows/office-hours-cron.yml`
- Modify: `apps/web/README.md`

**Steps:**
1. Add a scheduled job to call `/api/cron/office-hours-reminders` on a reasonable schedule (hourly is fine).
   - Vercel Cron Jobs are supported but can be plan-limited and have precision limits.
   - GitHub Actions can be used as a simple plan-agnostic scheduler.
2. Document required env var: `CRON_SECRET` (must be set in the Vercel project env) and how the scheduler authenticates.

---

### Task 7: Verification

**Commands:**
- `npm test` (from `apps/web`)
- `npm run lint` (from `apps/web`)

**Manual checks (staging):**
1. Check in, then close tab → confirm timeout cutoff is 60 minutes after last heartbeat; DB/UI may not reflect closure until the next cron run (hourly on Hobby, per-minute on Pro).
2. Check in, stay in office → confirm session remains open and periodic heartbeats succeed.
3. Check in, leave geofence → confirm immediate auto-checkout on next heartbeat.
4. Kiosk check-in → confirm it does not auto-checkout due to presence enforcement.
