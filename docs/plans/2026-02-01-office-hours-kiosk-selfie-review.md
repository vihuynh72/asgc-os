# Office Hours Kiosk Selfie + Reviewer Access Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the kiosk check-in mobile-first with an easy selfie capture flow, and add a separate permissioned reviewer experience for viewing kiosk check-in selfies.

**Architecture:** Kiosk check-in stays email-only, but the UI captures a selfie via `getUserMedia` when available (fallback to file upload). Photos remain stored in Supabase Storage, and reviewers view them via short-lived signed URLs generated server-side. A new Supabase RPC `can_view_office_hours_photos()` gates access (full admin + EVP by default, plus explicit reviewers).

**Tech Stack:** Next.js App Router (Route Handlers + Server Components), Supabase (RPC + Storage), Tailwind UI primitives.

### Task 1: Photo reviewer permission (DB)

**Files:**
- Create: `supabase/migrations/202602010001_patch_office_hours_kiosk_photo_reviewer_permission.sql`

**Steps:**
1. Create `office_hours_photo_reviewers` table (user_id).
2. Add `can_view_office_hours_photos()` RPC (full admin + EVP OR reviewer).
3. Add `set_office_hours_photo_reviewer(uuid, boolean)` RPC (full admin only) to manage reviewers.

### Task 2: Reviewer UI + APIs

**Files:**
- Create: `apps/web/src/app/office-hours/kiosk/review/page.tsx`
- Create: `apps/web/src/app/office-hours/kiosk/review/review-panel.tsx`
- Create: `apps/web/src/app/api/office-hours/kiosk/review/sessions/route.ts`
- Create: `apps/web/src/app/api/office-hours/kiosk/review/photo/route.ts`

**Steps:**
1. Gate page + APIs with `can_view_office_hours_photos()`.
2. List allowlisted sessions in a date range where a kiosk selfie exists.
3. Generate signed URLs for a single session selfie (short expiration).

### Task 3: Kiosk UI (mobile selfie capture)

**Files:**
- Modify: `apps/web/src/app/office-hours/kiosk/page.tsx`

**Steps:**
1. Implement camera capture using `getUserMedia` (front camera) with a “Take selfie” button.
2. Add fallback to file upload when camera is unavailable or blocked.
3. Simplify kiosk flow: if already checked in, show “Check out” only; otherwise show selfie + check-in.

### Task 4: Admin discoverability

**Files:**
- Modify: `apps/web/src/app/admin/office-hours/admin-office-hours-panel.tsx`

**Steps:**
1. Add a “Selfies” button linking to `/office-hours/kiosk/review`.

### Task 5: Verification

**Steps:**
1. `cd apps/web && npm test`
2. `cd apps/web && npm run build`

