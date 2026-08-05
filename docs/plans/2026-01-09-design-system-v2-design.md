# Design System v2 (Apple-Like) + Kill Switch

> **Archive notice:** This dated plan records design intent at the time it was written. It is not current setup guidance or evidence that a task was completed. Paths, names, commands, and expected results may differ from the current repository. Current code, migrations, and the repository [`README`](../../README.md) take precedence.

**Goal:** Upgrade the global aesthetic (typography, surfaces, radii, shadows, and neutrals) to feel modern, Apple-like, and low-cognitive-load, while keeping a fast rollback path.

## Principles

- **Calm by default:** neutrals first; teal/orange only as accents.
- **Depth without noise:** soft elevation + subtle borders over heavy outlines.
- **Consistency:** define tokens once; let Tailwind utilities inherit.
- **Safe rollout:** switchable v1/v2 without code changes.

## Token Strategy

The design system is driven by CSS variables in `apps/web/src/app/globals.css`:

- **Semantic color tokens:** `--background`, `--card`, `--muted`, `--border`, etc.
- **Typography token:** `--app-font-sans` (v2 uses system font stack; v1 uses existing Lato var).
- **Radii + shadows:** override Tailwind’s `--radius-*` and `--shadow-*` variables so existing `rounded-*` and `shadow-*` utilities automatically adopt the new feel across the app.

## Rollout / Kill Switch

- The app sets `<html data-design="v1|v2">` in `apps/web/src/app/layout.tsx`.
- Effective design is selected by:
  1) cookie `asgc_design` (per-browser override), else
  2) env `DESIGN_DEFAULT` (`v1` or `v2`, defaults to `v2`).
- Middleware supports `?design=v1|v2` to set the cookie and redirect back to the clean URL.

## Dashboard “Get Started” Hint

For truly new users (no hours logged this week), the dashboard surfaces a small inline hint with a “Log hours” CTA and a dismiss action stored locally (localStorage). It auto-hides once hours are logged.
