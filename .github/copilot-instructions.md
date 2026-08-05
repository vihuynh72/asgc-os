# Copilot instructions (ASGC OS)

## Read first (project reality)
- The original build packet lives in `docs/specifications`; treat it as design history, not proof of current behavior.
- Start with `README.md` and `docs/README.md`; historical phase progress lives in `docs/history/phase-progress.md`.
- Single Next.js App Router app in `apps/web`; backend is Supabase Postgres + Auth.
- RLS is authoritative; UI hiding is non-authoritative.
- Schema changes happen via SQL migrations in `supabase/migrations` (avoid Dashboard SQL editor except emergencies).

## Where things live
- UI routes: `apps/web/src/app/**` (App Router).
- API routes: `apps/web/src/app/api/**/route.ts` (example: `apps/web/src/app/api/tasks/route.ts`).
- Auth/admin gating proxy: `apps/web/src/proxy.ts`.

## Auth + admin conventions (do not break)
- Invite-only magic link: `apps/web/src/app/api/auth/request-magic-link/route.ts` must never leak allowlist membership (always respond `{ ok: true }`).
- Callback sets cookie session: `apps/web/src/app/auth/callback/route.ts`.
- Admin checks use `rpc('is_admin')` (middleware + admin endpoints), e.g. `apps/web/src/app/api/admin/invites-allowlist/route.ts`.
- Proxy behavior to preserve: redirects magic-link params to `/auth/callback`, supports kiosk fallback for office-hours flows.

## Supabase client patterns (use existing helpers)
- Env is Zod-validated: `apps/web/src/lib/env.ts` (public) and `apps/web/src/lib/envServer.ts` (server-only; includes AI, email, SMS, and cron schemas).
- Browser client: `getSupabaseBrowserClient()` in `apps/web/src/lib/supabaseClient.ts`.
- Server Components client: `getSupabaseServerComponentClient()` in `apps/web/src/lib/supabaseServerComponent.ts`.
- Service-role/admin client (server-only): `getSupabaseAdminClient()` in `apps/web/src/lib/supabaseAdmin.ts`.
- Route Handlers:
  - If cookie refresh must persist, use `getSupabaseRouteHandlerClient()` in `apps/web/src/lib/supabaseServer.ts`.
  - If you only need `auth.getUser()` and won’t set cookies, `@supabase/ssr` `createServerClient(...)` with a no-op `setAll()` is an accepted pattern.
- Prefer anon+cookie client for user reads/writes (lets RLS enforce); use service-role client only for admin-only operations (bypasses RLS).

## DB/RLS patterns that shape app code
- Assume RLS enforces access; UI hiding is non-authoritative.
- User-driven audit logging that would fail under RLS should be handled via `SECURITY DEFINER` functions/triggers with pinned `search_path` + EXECUTE revoked (see `supabase/migrations/202512160007_phase07_1_tasks_audit_fix.sql`).
- RLS smoke scripts live in `supabase/rls` (e.g. `supabase/rls/phase09_rls_smoke.sql`).

## API Route Handler conventions (common in this repo)
- Validate JSON bodies with Zod and `safeParse` (return `{ error: "invalid_request" }` + 400 on failure).
- Auth pattern: `createServerClient(...anon...)` + `auth.getUser()`; return 401 JSON when missing.
- Admin-write pattern: still auth-check with anon client + `rpc('is_admin')`, then do the write via `getSupabaseAdminClient()`.
- For heavier Node-only work (e.g. PDF generation), set `export const runtime = "nodejs"`.
- Audit: admin writes frequently call `admin.rpc("log_event", ...)` after DB mutations.

## Local workflows (what actually runs here)
- Web dev: run `npm --prefix apps/web ci`, then `test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local`, then `npm --prefix apps/web run dev`.
- Full web gate: `npm --prefix apps/web run check && npm --prefix apps/web run build`.
- DB migrations: `supabase link --project-ref <ref>` then `supabase db push --dry-run` → `supabase db push`.

## Known gotcha
- Keep the Supabase bundling workaround: `apps/web/package.json` uses `next ... --webpack`, and `apps/web/next.config.ts` aliases `@supabase/supabase-js` to a CJS entrypoint.
