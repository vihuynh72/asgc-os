# Copilot instructions (ASGC OS)

## Big picture (read first)
- Product + architecture source-of-truth is the build packet: [00_product_brief.md](../00_product_brief.md) → [04_office_hours_spec.md](../04_office_hours_spec.md).
- Single Next.js App Router app in [apps/web](../apps/web); backend is Supabase Postgres with RLS as the authoritative permission system.
- DB schema changes are SQL migrations in [supabase/migrations](../supabase/migrations) (avoid Dashboard SQL editor except emergencies).

## Key structure + conventions
- Pages/routes: [apps/web/src/app](../apps/web/src/app); API Route Handlers live under `app/api/**/route.ts` (example: [apps/web/src/app/api/tasks/route.ts](../apps/web/src/app/api/tasks/route.ts)).
- Auth is invite-only magic-link:
  - Request endpoint must not leak allowlist membership (always `{ ok: true }`): [apps/web/src/app/api/auth/request-magic-link/route.ts](../apps/web/src/app/api/auth/request-magic-link/route.ts)
  - Callback exchanges `code` for cookie session: [apps/web/src/app/auth/callback/route.ts](../apps/web/src/app/auth/callback/route.ts)
  - Route protection + `/admin` gate happens in middleware via `rpc('is_admin')`: [apps/web/src/middleware.ts](../apps/web/src/middleware.ts)

## Supabase clients (use these; don’t reinvent)
- Env is Zod-validated: public in [apps/web/src/lib/env.ts](../apps/web/src/lib/env.ts); server-only in [apps/web/src/lib/envServer.ts](../apps/web/src/lib/envServer.ts).
- Browser: `getSupabaseBrowserClient()` in [apps/web/src/lib/supabaseClient.ts](../apps/web/src/lib/supabaseClient.ts).
- Server Components (cookie-aware): `getSupabaseServerComponentClient()` in [apps/web/src/lib/supabaseServerComponent.ts](../apps/web/src/lib/supabaseServerComponent.ts).
- Admin/service-role (server-only): `getSupabaseAdminClient()` in [apps/web/src/lib/supabaseAdmin.ts](../apps/web/src/lib/supabaseAdmin.ts).
- Route Handlers:
  - If cookies must be persisted, use `getSupabaseRouteHandlerClient()` in [apps/web/src/lib/supabaseServer.ts](../apps/web/src/lib/supabaseServer.ts).
  - For JSON endpoints that don’t need auth refresh, it’s OK to use `createServerClient(...)` with a no-op `setAll()` (pattern used in tasks API).

## DB/RLS patterns that affect app code
- Assume RLS enforces access (committee scoping, admin-only tables); UI hiding is non-authoritative.
- User-driven audit logging should be done with `SECURITY DEFINER` trigger/functions with pinned `search_path` and execution revoked (example: [supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql](../supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql)).
- RLS smoke SQL scripts live in [supabase/rls](../supabase/rls) (example: [supabase/rls/phase13_rls_smoke.sql](../supabase/rls/phase13_rls_smoke.sql)).

## Local workflows (repo-specific)
- Web dev:
  - `cd apps/web && npm install`
  - `cp .env.example .env.local` then set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - Phase 10 email env (server-only): `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY`.
  - Run: `npm run dev` (note: uses `next dev --webpack`).
- DB migrations (recommended): `supabase link --project-ref <ref>` then `supabase db push --dry-run` → `supabase db push`.

## Known gotcha
- Keep the Supabase bundling workaround: scripts use `next ... --webpack`, and [apps/web/next.config.ts](../apps/web/next.config.ts) aliases `@supabase/supabase-js` to the CJS entrypoint.
