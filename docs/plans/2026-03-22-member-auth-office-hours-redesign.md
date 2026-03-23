# Member Auth + Integrated Office Hours Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the split login and public kiosk flow with a signed-in, trusted-device-aware auth journey and a selfie-based Office Hours experience that feels native to the main ASGC app.

**Architecture:** Auth gains a staged password sign-in path backed by database-tracked email challenges and trusted devices. Office Hours becomes an authenticated flow with a unified action screen that branches between selfie check-in and direct check-out. Shared styling in the auth and Office Hours surfaces shifts to a calmer mobile-first visual system.

**Tech Stack:** Next.js App Router, Supabase auth/storage/Postgres, Node test runner (`node --test`), Tailwind v4, React 19.

### Task 1: Add auth persistence tables, password readiness, and shared helpers

**Files:**
- Create: `supabase/migrations/202603220001_member_auth_office_hours_redesign.sql`
- Create: `apps/web/src/lib/auth/trusted-device.ts`
- Create: `apps/web/src/lib/auth/password-signin.ts`
- Test: `apps/web/test/auth-trusted-device.test.mjs`

**Step 1: Write the failing test**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL because the trusted-device/password-signin helpers do not exist.

**Step 2: Implement minimal shared helpers**

Add deterministic cookie/device helpers, challenge expiry helpers, and password-ready gate helpers used by routes and middleware.

**Step 3: Run tests**

Run: `npm test` (from `apps/web/`)  
Expected: PASS.

### Task 2: Implement staged password sign-in + password setup APIs

**Files:**
- Modify: `apps/web/src/app/api/auth/signin-password/route.ts`
- Create: `apps/web/src/app/api/auth/complete-password-signin/route.ts`
- Create: `apps/web/src/app/api/auth/setup-password/route.ts`
- Test: `apps/web/test/password-signin-flow.test.mjs`

**Step 1: Write the failing test**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL on the missing staged sign-in behavior helpers.

**Step 2: Implement minimal server flow**

Behavior:
- trusted browser: finish password sign-in immediately
- untrusted browser: create email challenge + pending cookie + return `nextStep: "email_otp"`
- setup-password: update auth password + mark `profile_private.password_ready_at`

**Step 3: Run tests**

Run: `npm test` (from `apps/web/`)  
Expected: PASS.

### Task 3: Add trusted-device account APIs and UI helpers

**Files:**
- Create: `apps/web/src/app/api/account/trusted-devices/route.ts`
- Create: `apps/web/src/app/api/account/trusted-devices/[deviceId]/route.ts`
- Create: `apps/web/src/lib/account/trusted-devices.mjs`
- Test: `apps/web/test/account-trusted-devices.test.mjs`

**Step 1: Write the failing test**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL because the account trusted-device model is missing.

**Step 2: Implement minimal list/revoke behavior**

Return current-device labeling, expiry metadata, and revoke support scoped to the signed-in user.

**Step 3: Run tests**

Run: `npm test` (from `apps/web/`)  
Expected: PASS.

### Task 4: Update middleware/proxy and Office Hours gates

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/proxy.ts`
- Create: `apps/web/src/lib/office-hours-gates.mjs`
- Test: `apps/web/test/office-hours-gates.test.mjs`

**Step 1: Write the failing test**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL because the new route-gating helpers do not exist.

**Step 2: Implement minimal gating**

Behavior:
- auth required for member routes
- MFA stays for admin/selfie-review routes
- Office Hours self-service redirects signed-in users without `password_ready_at`
- `/office-hours/kiosk` becomes a redirect shim

**Step 3: Run tests**

Run: `npm test` (from `apps/web/`)  
Expected: PASS.

### Task 5: Convert authenticated Office Hours action APIs

**Files:**
- Modify: `apps/web/src/app/api/office-hours/check-in/route.ts`
- Modify: `apps/web/src/app/api/office-hours/check-out/route.ts`
- Create: `apps/web/src/lib/office-hours/member-action.mjs`
- Test: `apps/web/test/office-hours-member-action.test.mjs`

**Step 1: Write the failing test**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL because the member action helper is missing.

**Step 2: Implement minimal action logic**

Behavior:
- signed-in selfie check-in consumes `multipart/form-data`
- open session path becomes direct check-out
- selfie uploads reuse the current bucket/path conventions

**Step 3: Run tests**

Run: `npm test` (from `apps/web/`)  
Expected: PASS.

### Task 6: Redesign login, password setup, and Office Hours member UI

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/office-hours/setup-password/page.tsx`
- Modify: `apps/web/src/app/office-hours/page.tsx`
- Modify: `apps/web/src/app/office-hours/check-in/page.tsx`
- Modify: `apps/web/src/app/office-hours/check-out/page.tsx`
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add or extend UI view-model tests where practical**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL on new auth/Office Hours copy or flow helpers until implemented.

**Step 2: Implement the shared visual system and unified action flow**

Use calmer glass cards, tighter copy, mobile-first spacing, and a camera-first check-in path. Keep the interface app-native rather than kiosk-like.

**Step 3: Run tests and build**

Run: `npm test` (from `apps/web/`)  
Run: `npm run build` (from `apps/web/`)  
Expected: PASS.

### Task 7: Update account/admin surfaces and verify end-to-end compatibility

**Files:**
- Modify: `apps/web/src/app/account/page.tsx`
- Modify: `apps/web/src/app/admin/office-hours/_components/office-hours-kiosk-panel.tsx`
- Modify: `apps/web/src/app/admin/office-hours/office-hours-kiosk-page.tsx`
- Modify: `apps/web/src/app/api/admin/office-hours/sessions/route.ts`

**Step 1: Add any missing tests for labels/view models**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL if new labels/helpers are not yet wired.

**Step 2: Implement minimal admin/account changes**

Behavior:
- trusted devices visible and revocable from Account
- admin kiosk page becomes check-in operations/onboarding visibility
- historical `sms_otp` rows remain distinct from new `selfie` rows

**Step 3: Final verification**

Run: `npm test` (from `apps/web/`)  
Run: `npm run build` (from `apps/web/`)  
Expected: PASS.
