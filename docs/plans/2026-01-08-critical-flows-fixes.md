# Critical Broken Flows Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix agenda PDF preview/download links, board vote recording, and expense logging usability (budget lines + stale lookups).

**Architecture:** Keep existing Supabase RPC authorization checks, but improve server-side signed URL creation reliability and tighten finance UI selection/feedback. Prefer small, test-backed helpers in `apps/web/src/lib/*.mjs` and keep UI changes minimal.

**Tech Stack:** Next.js App Router (Node runtime), Supabase (RLS + RPC), `node:test` (`npm test` in `apps/web`), Tailwind UI.

---

### Task 1: Agenda PDF preview/download signed URL reliability

**Files:**
- Create: `apps/web/src/lib/storage-signed-url.mjs`
- Test: `apps/web/test/storage-signed-url.test.mjs`
- Modify: `apps/web/src/app/api/docs/[docId]/route.ts`

**Step 1: Write failing test**

`apps/web/test/storage-signed-url.test.mjs` should assert we return a URL from the fallback when the primary storage client returns an error.

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test test/storage-signed-url.test.mjs`
Expected: FAIL with missing module/function or incorrect return.

**Step 3: Write minimal implementation**

Implement `createSignedUrlWithFallback({ primary, fallback, bucket, path, expiresIn })` in `apps/web/src/lib/storage-signed-url.mjs`.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test test/storage-signed-url.test.mjs`
Expected: PASS

**Step 5: Wire into route**

In `apps/web/src/app/api/docs/[docId]/route.ts`, after confirming `can_view_doc`, generate signed URL using:
- `primary`: user client `supabase.storage`
- `fallback`: service-role `getSupabaseAdminClient().storage`

---

### Task 2: Board vote recording UX + clearer errors

**Files:**
- Create: `apps/web/src/lib/finance-errors.mjs`
- Test: `apps/web/test/finance-errors.test.mjs`
- Modify: `apps/web/src/app/finance/finance-dashboard.tsx`

**Step 1: Write failing test**

`apps/web/test/finance-errors.test.mjs` should assert common RPC error strings are mapped to user-friendly text (e.g. `funding_request_not_ready_for_vote`).

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test test/finance-errors.test.mjs`
Expected: FAIL with missing module/function.

**Step 3: Write minimal implementation**

Implement `formatFinanceErrorMessage(message)` in `apps/web/src/lib/finance-errors.mjs`.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test test/finance-errors.test.mjs`
Expected: PASS

**Step 5: Apply to Board Votes UI**

In `apps/web/src/app/finance/finance-dashboard.tsx`:
- Filter funding request dropdown to only `state === "scheduled_for_vote"`.
- Use `formatFinanceErrorMessage` for load/save error display.
- Add helper copy explaining only scheduled requests can be linked.

---

### Task 3: Budget lines + expenses usability (and stale lookups refresh)

**Files:**
- Create: `apps/web/src/lib/finance-inputs.mjs`
- Test: `apps/web/test/finance-inputs.test.mjs`
- Modify: `apps/web/src/app/finance/finance-dashboard.tsx`

**Step 1: Write failing tests**

`apps/web/test/finance-inputs.test.mjs` should cover:
- `sanitizeFiscalYearInput("202a6") === "2026"`
- `parseFiscalYearInput("2026foo") === 2026`
- invalid values return `null`

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test test/finance-inputs.test.mjs`
Expected: FAIL with missing module/function.

**Step 3: Write minimal implementation**

Implement:
- `sanitizeFiscalYearInput(value, { maxDigits = 4 })`
- `parseFiscalYearInput(value, { min = 2000 })`

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test test/finance-inputs.test.mjs`
Expected: PASS

**Step 5: Update Budget Lines UI**

In `BudgetLinesPanel`:
- Use a numeric-text input (digits only, max 4) and sanitize on change.
- Validate using `parseFiscalYearInput` and show a clear error message.

**Step 6: Update Expenses UI**

In `ExpensesPanel`:
- Detect if there are no active budget lines.
- Show a callout with a link to `#budget-lines`.
- Disable the budget line selector + submit button until a budget line exists.

**Step 7: Refresh shared lookups**

In `FinanceDashboard`:
- Add a `lookupsRefreshToken` and `refreshLookups()` to re-run `/api/finance/lookups`.
- Add a subtle `Refresh data` button.
- Pass `onLookupsChanged={refreshLookups}` to panels that create/update finance entities (at minimum budget lines + funding requests).

---

### Task 4: Verification

Run:
- `cd apps/web && npm test`
- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`

Expected:
- All commands succeed; build may show warnings, but no errors.

