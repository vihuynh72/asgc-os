# Privacy Policy Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a dedicated public privacy policy page for ASGC OS that accurately discloses office-hours kiosk SMS usage and makes clear that only registered ASGC members on the approved kiosk phone allowlist may receive texts.

**Architecture:** Add a small reusable privacy content model in `apps/web/src/lib/privacy-policy.mjs`, then render that content through a dedicated App Router page at `/privacy`. Update the shared footer and the kiosk OTP step to point to the new route so members can review the disclosure at the point where SMS is requested.

**Tech Stack:** Next.js App Router, React Server Components, `node:test`, Tailwind utility classes.

### Task 1: Privacy content model + test

**Files:**
- Create: `apps/web/src/lib/privacy-policy.mjs`
- Create: `apps/web/test/privacy-policy.test.mjs`

**Step 1: Write the failing test**

Add a test that asserts the privacy model includes:
- a page title and description for a dedicated privacy policy
- an SMS-focused section covering one-time verification codes and office-hours reminder texts
- a clear statement that only registered ASGC members with admin-approved numbers may receive these texts
- a clear statement that members of the public do not receive kiosk SMS messages

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- test/privacy-policy.test.mjs`
Expected: FAIL because `../src/lib/privacy-policy.mjs` does not exist yet.

**Step 3: Write minimal implementation**

Export a `getPrivacyPolicyContent()` function that returns the structured copy the page will render.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npm test -- test/privacy-policy.test.mjs`
Expected: PASS

### Task 2: Dedicated privacy page

**Files:**
- Create: `apps/web/src/app/privacy/page.tsx`

**Step 1: Render the tested privacy content**

Use `PageShell` to render:
- heading: `Privacy Policy`
- a concise intro
- sectioned content from `getPrivacyPolicyContent()`

**Step 2: Keep the page public and scannable**

Use simple semantic sections, short paragraphs, and bullet lists where the SMS rules are easier to scan.

### Task 3: Link updates

**Files:**
- Modify: `apps/web/src/components/site-footer.tsx`
- Modify: `apps/web/src/app/office-hours/kiosk/page.tsx`
- Optional modify: `apps/web/src/app/legal/page.tsx`

**Step 1: Update the footer**

Point the existing privacy link to `/privacy`.

**Step 2: Update the kiosk OTP flow**

Add compact disclosure copy near the SMS code request step with a link to `/privacy`, and state that only approved registered members receive texts.

**Step 3: Keep `/legal` coherent**

If needed, replace the old generic privacy paragraph with a short summary and a link to the dedicated policy page.

### Task 4: Verification

**Steps:**
1. Run `cd apps/web && npm test -- test/privacy-policy.test.mjs`
2. Run `cd apps/web && npm test -- test/office-hours-kiosk-messages.test.mjs`
3. Run `cd apps/web && npm run lint`
