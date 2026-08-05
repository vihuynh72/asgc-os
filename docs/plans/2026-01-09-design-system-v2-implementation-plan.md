# Design System v2 + Kill Switch Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Ship a token-driven global aesthetic refresh (v2) with a cookie/env kill switch to revert to v1 instantly.

**Architecture:** CSS variables in `apps/web/src/app/globals.css` define v2 tokens and a v1 override keyed off `<html data-design="...">`. Middleware supports `?design=v1|v2` to set a cookie and redirect.

**Tech Stack:** Next.js App Router, Tailwind v4 theme variables, Node test runner (`node --test`).

### Task 1: Add design toggle helpers (test-first)

**Files:**
- Create: `apps/web/src/lib/design-toggle.mjs`
- Test: `apps/web/test/design-toggle.test.mjs`

**Step 1: Write the failing test**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL because `../src/lib/design-toggle.mjs` is missing.

**Step 2: Implement minimal helpers**

Add `normalizeDesign`, `coerceDefaultDesign`, `getEffectiveDesign`, and `stripDesignParam`.

**Step 3: Run tests**

Run: `npm test` (from `apps/web/`)  
Expected: PASS.

### Task 2: Wire middleware query param → cookie

**Files:**
- Modify: `apps/web/src/middleware.ts`

**Step 1: Add design query handling early**

Behavior:
- If `?design=v1|v2` is present, set cookie `asgc_design` and redirect to the same URL without the param.

**Step 2: Verify build**

Run: `npm run build` (from `apps/web/`)  
Expected: PASS.

### Task 3: Set `data-design` on `<html>`

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Read cookie + env default**

Behavior:
- `asgc_design` cookie wins, else `DESIGN_DEFAULT` env, else `v2`.
- Set `<html data-design="...">`.

**Step 2: Verify build**

Run: `npm run build` (from `apps/web/`)  
Expected: PASS.

### Task 4: Introduce v2 tokens with v1 override

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Update `:root` values for v2**

Include:
- Semantic neutrals (`--background`, `--border`, etc.)
- System font stack (`--app-font-sans`)
- Tailwind radii/shadows overrides (`--radius-*`, `--shadow-*`)

**Step 2: Add `:root[data-design="v1"]` override**

Restore existing v1 token values + Tailwind default radii/shadows.

**Step 3: Verify build**

Run: `npm run build` (from `apps/web/`)  
Expected: PASS.

### Task 5: Add dashboard “Get started” hint (testable core logic)

**Files:**
- Create: `apps/web/src/lib/dashboard-get-started.mjs`
- Test: `apps/web/test/dashboard-get-started.test.mjs`
- Create: `apps/web/src/app/dashboard/get-started-hint.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`

**Step 1: Write failing test for core gating logic**

Run: `npm test` (from `apps/web/`)  
Expected: FAIL because the helper module is missing.

**Step 2: Implement helper + client component**

Behavior:
- Show only when weekly total is 0.
- Hide when dismissed (localStorage) or when hours are logged later.

**Step 3: Run tests and build**

Run: `npm test` (from `apps/web/`)  
Run: `npm run build` (from `apps/web/`)  
Expected: PASS.
