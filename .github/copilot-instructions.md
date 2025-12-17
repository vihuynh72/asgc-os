# Copilot instructions (ASGC OS)

## Big picture
- Product/architecture source-of-truth is the build packet: [00_product_brief.md](../00_product_brief.md), [01_stack_and_architecture.md](../01_stack_and_architecture.md), [02_data_model.md](../02_data_model.md), [03_security_and_permissions.md](../03_security_and_permissions.md), [04_office_hours_spec.md](../04_office_hours_spec.md).
- App is a single Next.js App Router site in [apps/web](../apps/web) using Supabase Postgres + RLS; schema changes are applied via SQL migrations in [supabase/migrations](../supabase/migrations).

## Web app structure & patterns
- Routes/pages live under [apps/web/src/app](../apps/web/src/app) (App Router). API endpoints are Route Handlers under `app/api/**/route.ts` (e.g. tasks: [apps/web/src/app/api/tasks/route.ts](../apps/web/src/app/api/tasks/route.ts)).
- Authentication is Supabase magic-link invite-only:
  - Allowlist-gated request endpoint returns generic `{ ok: true }` even if not allowlisted (don’t leak membership): [apps/web/src/app/api/auth/request-magic-link/route.ts](../apps/web/src/app/api/auth/request-magic-link/route.ts)
  - OAuth/magic-link callback exchanges `code` for a cookie session: [apps/web/src/app/auth/callback/route.ts](../apps/web/src/app/auth/callback/route.ts)
  - Protected routes + admin gate are enforced in middleware using `rpc('is_admin')`: [apps/web/src/middleware.ts](../apps/web/src/middleware.ts)

## Supabase client conventions (don’t reinvent)
- **Public env** is validated with Zod; prefer `getPublicEnv()` over reading `process.env` directly: [apps/web/src/lib/env.ts](../apps/web/src/lib/env.ts)
- **Server-only env** (`SUPABASE_SERVICE_ROLE_KEY`) is validated via: [apps/web/src/lib/envServer.ts](../apps/web/src/lib/envServer.ts)
- Browser client: `getSupabaseBrowserClient()` in [apps/web/src/lib/supabaseClient.ts](../apps/web/src/lib/supabaseClient.ts)
- Server Component client (cookie-aware): `getSupabaseServerComponentClient()` in [apps/web/src/lib/supabaseServerComponent.ts](../apps/web/src/lib/supabaseServerComponent.ts)
- Admin/service-role client (server-only; never in client bundles): `getSupabaseAdminClient()` in [apps/web/src/lib/supabaseAdmin.ts](../apps/web/src/lib/supabaseAdmin.ts)
- Route Handlers typically use `@supabase/ssr` `createServerClient(...)` with cookie `getAll()` and a no-op `setAll()` (no auth refresh needed for JSON endpoints). For login/callback and middleware, implement `setAll()` to persist cookies.

## DB/RLS rules that affect code
- Treat RLS as authoritative authorization; app code should assume committee scoping is enforced by policies.
- Audit logging for user-driven writes should be done via `SECURITY DEFINER` triggers/functions with `set search_path = public` and revoked execution (see [supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql](../supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql)).

## Local workflows (repo-specific)
- Web dev:
  - `cd apps/web && npm install`
  - Create `apps/web/.env.local` (note: there is currently no committed `.env.example`) with:
    - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
  - `npm run dev`
- Supabase migrations (preferred; avoid Dashboard SQL editor except emergencies):
  - `supabase link --project-ref <ref>`
  - `supabase db push --dry-run` then `supabase db push`

## Known gotcha
- Keep the Supabase bundling workaround: scripts use `next ... --webpack`, and [apps/web/next.config.ts](../apps/web/next.config.ts) aliases `@supabase/supabase-js` to the CJS entrypoint to avoid ESM bundling conflicts.
