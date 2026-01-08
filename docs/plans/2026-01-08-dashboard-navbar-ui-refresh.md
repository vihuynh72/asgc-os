# Dashboard + Navbar UI Refresh Implementation Plan

> **For Codex:** If executing task-by-task, use `superpowers:executing-plans` for checkpoints. (This repo’s system instructions say not to `git commit` unless explicitly requested.)

**Goal:** Make the `/dashboard` and navbar feel Apple-simple: fewer visible choices, calmer surfaces, clearer hierarchy, and better readability.

**Architecture:** Keep all existing data-fetching and routing; this is a presentation refactor only. Simplify navigation by limiting primary links to 4 and consolidating everything else under a single “More” menu plus a minimal user avatar menu.

**Tech Stack:** Next.js App Router (RSC + client components), Tailwind CSS v4 (CSS variables), Radix Popover, Supabase (server + client).

---

### Task 1: Align theme tokens with “80% Apple, 20% warm”

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Update light theme variables**
- Move toward neutral gray background with a slight warm tint.
- Increase text contrast by shifting `--foreground` toward near-black.
- Keep `--primary` as the brand accent; reduce how often it’s used in UI.

**Step 2: Sanity-check dark theme stays readable**
- Keep existing dark values unless contrast regresses.

**Verification**
- Run: `cd apps/web && npm run build`
- Expected: Build succeeds; no missing CSS tokens.

---

### Task 2: Fix Popover surface tokens (ensure menus are readable)

**Files:**
- Modify: `apps/web/src/components/ui/popover.tsx`

**Step 1: Replace undefined `bg-popover` / `text-popover-foreground`**
- Use `bg-card` + `text-foreground` + `border-border/60` so popovers always render with a visible surface.

**Verification**
- Run: `cd apps/web && npm run build`
- Expected: Build succeeds; popovers have a solid background.

---

### Task 3: Add a minimal avatar user menu (no email in navbar)

**Files:**
- Create: `apps/web/src/components/user-menu.tsx`
- Modify: `apps/web/src/components/site-nav.tsx`

**Step 1: Create `UserMenu`**
- Client component using `Popover`.
- Trigger: small circular button showing initials (derived from email if present, else user id).
- Content: `Account` link + `Sign out` form action (`/auth/signout`).

**Step 2: Replace the current email + sign out UI**
- In `SiteNav`, render `UserMenu` when signed in.
- Keep `Sign in` button when signed out.

**Verification**
- Run: `cd apps/web && npm run lint`
- Expected: No lint errors.

---

### Task 4: Simplify the navbar information architecture

**Files:**
- Modify: `apps/web/src/components/site-nav.tsx`
- Modify: `apps/web/src/components/site-nav-links.tsx`

**Step 1: Restrict primary links**
- Desktop primary links: `Dashboard`, `Meetings`, `Tasks`, `Office Hours`.

**Step 2: Consolidate everything else into a single “More” menu**
- “More” menu sections:
  - Community: Clubs, ICC
  - Resources: Finance, Documents
  - Admin (admins only): Admin home, Create meeting (only if permitted)
- Remove the standalone “Create meeting” button from the navbar.

**Step 3: Calm the active/hover styles**
- Replace underline-heavy active state with a subtle pill highlight.
- Ensure focus-visible rings remain for accessibility.

**Verification**
- Run: `cd apps/web && npm run build`
- Expected: No runtime type errors; `SiteNavLinks` renders on mobile + desktop.

---

### Task 5: Make `/dashboard` calmer without changing data

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

**Step 1: Reduce visual noise**
- Soften rings/shadows on cards and lists (hairline borders, subtle shadows).
- Keep existing information, but reduce “boxiness” and heavy outlines.

**Step 2: Keep shortcuts but make them quieter**
- Maintain shortcut section, but lighten icon tiles and spacing so it doesn’t compete with the main card.

**Verification**
- Run: `cd apps/web && npm run build`
- Expected: Build succeeds; page renders.

---

### Task 6: Final verification (before calling it “done”)

**Run**
- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`

**Manual spot-check**
- Desktop: primary links limited to 4 + More menu + avatar menu.
- Mobile: hamburger shows all destinations grouped; nothing is missing.
- Dashboard: text contrast improved; surfaces look calmer; no broken links.

