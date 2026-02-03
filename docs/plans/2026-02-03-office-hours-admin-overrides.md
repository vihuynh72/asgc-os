# Office Hours Admin Overrides Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow full admins/EVP to close open office-hour sessions, adjust end time (within check-in → now), choose whether hours count, and notify members with a clean Apple-like admin UX.

**Architecture:** Add admin override columns + a security-definer RPC in Supabase, update weekly rollups to exclude admin-excluded sessions, and expose a new admin API route that calls the RPC and sends a notification email. The Admin → Office Hours UI will add a slim “Admin actions” entry per open session and a slide‑over editor with required reason + count toggle.

**Tech Stack:** Supabase SQL (migrations + RPC), Next.js App Router, Zod validation, Tailwind UI, Node test runner (`node --test`).

---

### Task 1: Admin override helper + tests (TDD)

**Files:**
- Create: `apps/web/src/lib/office-hours-admin-overrides.mjs`
- Test: `apps/web/test/office-hours-admin-overrides.test.mjs`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateAdminCheckoutAt,
  computeAdminOverrideMinutes,
} from "../src/lib/office-hours-admin-overrides.mjs";

test("validateAdminCheckoutAt rejects times before check-in or after now", () => {
  const checkin = "2026-02-03T16:00:00.000Z";
  const now = "2026-02-03T18:00:00.000Z";

  assert.equal(validateAdminCheckoutAt({ checkinAtIso: checkin, checkoutAtIso: "2026-02-03T15:00:00.000Z", nowIso: now }).ok, false);
  assert.equal(validateAdminCheckoutAt({ checkinAtIso: checkin, checkoutAtIso: "2026-02-03T19:00:00.000Z", nowIso: now }).ok, false);
  assert.equal(validateAdminCheckoutAt({ checkinAtIso: checkin, checkoutAtIso: "2026-02-03T17:30:00.000Z", nowIso: now }).ok, true);
});

test("computeAdminOverrideMinutes returns non-negative minutes", () => {
  const checkin = "2026-02-03T16:00:00.000Z";
  const checkout = "2026-02-03T17:05:00.000Z";
  assert.equal(computeAdminOverrideMinutes(checkin, checkout), 65);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test test/office-hours-admin-overrides.test.mjs`

Expected: FAIL with “module not found” or missing exports.

**Step 3: Write minimal implementation**

```js
export function validateAdminCheckoutAt({ checkinAtIso, checkoutAtIso, nowIso }) {
  const checkinMs = Date.parse(checkinAtIso);
  const checkoutMs = Date.parse(checkoutAtIso);
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs) || !Number.isFinite(nowMs)) {
    return { ok: false, error: "invalid_timestamp" };
  }
  if (checkoutMs < checkinMs) return { ok: false, error: "before_checkin" };
  if (checkoutMs > nowMs) return { ok: false, error: "after_now" };
  return { ok: true };
}

export function computeAdminOverrideMinutes(checkinAtIso, checkoutAtIso) {
  const checkinMs = Date.parse(checkinAtIso);
  const checkoutMs = Date.parse(checkoutAtIso);
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs)) return 0;
  return Math.max(Math.round((checkoutMs - checkinMs) / 60000), 0);
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test test/office-hours-admin-overrides.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/office-hours-admin-overrides.mjs apps/web/test/office-hours-admin-overrides.test.mjs
git commit -m "test: add admin override validation helpers"
```

---

### Task 2: Supabase migration for admin overrides + rollup updates

**Files:**
- Create: `supabase/migrations/202602030001_patch_office_hours_admin_overrides.sql`

**Step 1: Add admin override columns + RPC**

```sql
begin;

alter table public.office_hour_sessions
  add column if not exists admin_closed_by uuid null references public.profiles(id) on delete set null,
  add column if not exists admin_closed_at timestamptz null,
  add column if not exists admin_closed_reason text null,
  add column if not exists admin_adjusted_checkout_at timestamptz null,
  add column if not exists admin_exclude_from_totals boolean not null default false;

create or replace function public.admin_close_office_hour_session(
  _session_id uuid,
  _checkout_at timestamptz,
  _exclude_from_totals boolean default false,
  _reason text
)
returns public.office_hour_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.office_hour_sessions;
  now_ts timestamptz := now();
  admin_info jsonb;
  admin_tier text;
  admin_is_evp boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  admin_tier := admin_info ->> 'tier';
  admin_is_evp := coalesce((admin_info ->> 'is_evp')::boolean, false);
  if admin_tier is null or (admin_tier <> 'full' and not (admin_is_evp and admin_tier = 'partial')) then
    raise exception 'forbidden';
  end if;

  if _session_id is null then
    raise exception 'session_id_required';
  end if;
  if _checkout_at is null then
    raise exception 'checkout_at_required';
  end if;
  if _reason is null or char_length(btrim(_reason)) = 0 then
    raise exception 'reason_required';
  end if;

  select * into sess
  from public.office_hour_sessions
  where id = _session_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if sess.status <> 'open' or sess.checkout_at is not null then
    raise exception 'session_not_open';
  end if;
  if _checkout_at < sess.checkin_at or _checkout_at > now_ts then
    raise exception 'invalid_checkout_time';
  end if;

  update public.office_hour_sessions
  set
    checkout_at = _checkout_at,
    status = 'closed',
    admin_closed_by = auth.uid(),
    admin_closed_at = now_ts,
    admin_closed_reason = _reason,
    admin_adjusted_checkout_at = _checkout_at,
    admin_exclude_from_totals = coalesce(_exclude_from_totals, false)
  where id = sess.id
  returning * into sess;

  perform public.log_event(
    'office_hours.admin_close',
    auth.uid(),
    'office_hour_session',
    sess.id,
    jsonb_build_object(
      'checkout_at', _checkout_at,
      'exclude_from_totals', coalesce(_exclude_from_totals, false),
      'reason', _reason
    )
  );

  return sess;
end;
$$;

revoke all on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) from public;
revoke all on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) from authenticated;
grant execute on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) to authenticated;
grant execute on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) to service_role;
```

**Step 2: Update rollups to exclude admin‑excluded sessions**

Update **latest** definitions of:
- `public.my_weekly_hours`
- `public.admin_weekly_hours`
- `public.enqueue_weekly_hours_reminders`

Add filter: `and coalesce(s.admin_exclude_from_totals, false) = false` anywhere sessions are summed.

**Step 3: Commit**

```bash
git add supabase/migrations/202602030001_patch_office_hours_admin_overrides.sql
git commit -m "feat: add admin office hours override rpc and rollup exclusions"
```

---

### Task 3: Admin close session API + notifications

**Files:**
- Create: `apps/web/src/app/api/admin/office-hours/close-session/route.ts`
- Modify: `apps/web/src/lib/office-hours-admin-overrides.mjs`

**Step 1: Write failing test (validation helper)**

```js
test("validateAdminCheckoutAt rejects invalid timestamps", () => {
  const result = validateAdminCheckoutAt({ checkinAtIso: "bad", checkoutAtIso: "also-bad", nowIso: "bad" });
  assert.equal(result.ok, false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test test/office-hours-admin-overrides.test.mjs`

Expected: FAIL with missing behavior.

**Step 3: Implement API route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/emailSender";
import { validateAdminCheckoutAt } from "@/lib/office-hours-admin-overrides";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  checkoutAt: z.string(),
  excludeFromTotals: z.boolean().optional().default(false),
  reason: z.string().trim().min(2),
});
```

- Call RPC `admin_close_office_hour_session` with route handler client (preserves auth.uid).
- Fetch member email via admin client and send notification.
- Insert/update `notification_log` (`queued` → `sent`/`failed`).
- Return `{ ok: true, session, notify_error? }`.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test test/office-hours-admin-overrides.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app/api/admin/office-hours/close-session/route.ts apps/web/src/lib/office-hours-admin-overrides.mjs apps/web/test/office-hours-admin-overrides.test.mjs
git commit -m "feat: add admin close-session API with notifications"
```

---

### Task 4: Admin sessions API enrich + UI data

**Files:**
- Modify: `apps/web/src/app/api/admin/office-hours/sessions/route.ts`
- Modify: `apps/web/src/app/admin/office-hours/admin-office-hours-panel.tsx`

**Step 1: Extend sessions API select**

Add to select list:
- `admin_closed_by, admin_closed_at, admin_closed_reason, admin_adjusted_checkout_at, admin_exclude_from_totals`

**Step 2: Extend session type + derived labels**

Update `OfficeHourAdminSession` type and enrich mapping to expose admin flags.

**Step 3: Commit**

```bash
git add apps/web/src/app/api/admin/office-hours/sessions/route.ts apps/web/src/app/admin/office-hours/admin-office-hours-panel.tsx
git commit -m "feat: surface admin override fields in office hours sessions"
```

---

### Task 5: Admin override UI (slide‑over)

**Files:**
- Modify: `apps/web/src/app/admin/office-hours/admin-office-hours-panel.tsx`

**Step 1: Add state + open session count**
- `overrideOpen`, `overrideSession`, `overrideCheckoutAt`, `overrideExclude`, `overrideReason`, `overrideSubmitting`, `overrideMessage`.
- Compute open sessions count; show a small badge near filters.

**Step 2: Add “Admin actions” pill for open sessions**
- Table view: new “Admin” column with a pill button for open sessions.
- Card view: a small “Admin actions” chip next to selfie/status.

**Step 3: Slide‑over UI**
- Right‑side drawer overlay with frosted header, session summary, datetime input (min=checkin, max=now), reason input, count toggle, and preview.
- Confirm button calls `POST /api/admin/office-hours/close-session`.
- Show “Admin‑closed” and “Excluded” badges in list.

**Step 4: Commit**

```bash
git add apps/web/src/app/admin/office-hours/admin-office-hours-panel.tsx
git commit -m "feat: add admin override slide-over for open sessions"
```

---

### Task 6: Verification

**Step 1: Run tests**

Run: `cd apps/web && npm test`

**Step 2: Run build**

Run: `cd apps/web && npm run build`

**Step 3: Manual sanity**
- Open Admin → Office Hours.
- Pick an open session → Admin actions → set end time → confirm.
- Verify audit log entry + email send (or error message).
- Verify session totals respect “Exclude from totals.”

---

Plan complete.
