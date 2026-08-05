# Navbar Sliding Active Indicator Implementation Plan

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Add a subtle, Apple-like sliding “active pill” indicator in the navbar that smoothly animates between items when navigating.

**Architecture:** Keep routing unchanged; implement a client-side indicator in `SiteNavLinks` that measures the active nav item’s DOM rect and animates an absolutely positioned background “pill” using CSS transitions. Respect `prefers-reduced-motion`.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Radix Popover.

---

### Task 1: Define the indicator behavior + targets

**Files:**
- Modify: `apps/web/src/components/site-nav-links.tsx`

**Step 1: Choose the highlighted element**
- If a primary link matches the current pathname, highlight that link.
- Else if the pathname is within any “More” section, highlight the “More” button.

**Step 2: Measurement strategy**
- Add a ref to the desktop nav container.
- Add `data-nav-key` attributes to the desktop primary links and “More” button.
- On pathname change (and on resize), compute active element offset relative to the container and set indicator style.

---

### Task 2: Add a regression test for the “which key is active” logic

**Files:**
- Create: `apps/web/src/lib/nav-indicator.mjs`
- Test: `apps/web/test/nav-indicator.test.mjs`

**Step 1: Write failing test**
```js
import test from "node:test";
import assert from "node:assert/strict";
import { getActiveNavKey } from "../src/lib/nav-indicator.mjs";

test("prefers primary link match over More", () => {
  assert.equal(getActiveNavKey("/tasks", ["/dashboard","/tasks"], true), "/tasks");
});
```

**Step 2: Run test**
- Run: `cd apps/web && npm test`
- Expected: FAIL (module/function missing)

**Step 3: Implement minimal function**
```js
export function getActiveNavKey(pathname, primaryHrefs, hasMore) {
  // return matching href, else "more" if hasMore, else null
}
```

**Step 4: Run tests**
- Run: `cd apps/web && npm test`
- Expected: PASS

---

### Task 3: Implement the animated indicator in the desktop navbar

**Files:**
- Modify: `apps/web/src/components/site-nav-links.tsx`

**Step 1: Render an indicator element**
- Add an absolutely-positioned `<span aria-hidden>` inside the desktop nav container.
- Animate with `transition-[transform,width] duration-300 ease-out`.
- Add `motion-reduce:transition-none`.

**Step 2: Keep items above the indicator**
- Apply `relative z-10` to the link/button elements.
- Reduce the “active” background classes so the indicator is the primary highlight.

**Step 3: Handle resize**
- Use `ResizeObserver` (if available) and a `window.resize` fallback to recompute.

---

### Task 4: Verification

**Run**
- `cd apps/web && npm run lint`
- `cd apps/web && npm test`
- `cd apps/web && npm run build`

**Manual spot-check**
- Clicking between primary links shows a smooth sliding pill.
- Navigating to routes inside “More” highlights the “More” pill.
- Reduced motion disables the sliding animation.
