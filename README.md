# ASGC OS (ASGC Work Operating System)

Internal-only web app for ASGC operations. This repo is driven by the build packet files:

- [00_product_brief.md](00_product_brief.md)
- [01_stack_and_architecture.md](01_stack_and_architecture.md)
- [02_data_model.md](02_data_model.md)
- [03_security_and_permissions.md](03_security_and_permissions.md)
- [04_office_hours_spec.md](04_office_hours_spec.md)

## Phase Progress (Build Packet)

This repo is built strictly phase-by-phase per [01_stack_and_architecture.md](01_stack_and_architecture.md).

- PHASE 01 — Bootstrap: ✅ complete
	- Next.js app scaffolded under [apps/web](apps/web)
	- Placeholder routes + minimal layout/nav
	- Public env validation + Supabase browser client wrapper
- PHASE 02 — Auth (invite-only): ✅ complete
	- DB migration applied via Supabase CLI: [supabase/migrations/202512160001_phase02_auth_invite_only.sql](supabase/migrations/202512160001_phase02_auth_invite_only.sql)
	- Invite-only magic link flow:
		- Login page: [apps/web/src/app/(auth)/login/page.tsx](apps/web/src/app/(auth)/login/page.tsx)
		- Request link endpoint (allowlist-gated): [apps/web/src/app/api/auth/request-magic-link/route.ts](apps/web/src/app/api/auth/request-magic-link/route.ts)
		- Callback route (sets session cookies): [apps/web/src/app/auth/callback/route.ts](apps/web/src/app/auth/callback/route.ts)
		- Protected routes middleware: [apps/web/src/middleware.ts](apps/web/src/middleware.ts)

Next up:

- PHASE 03 — Roles + term model (not started)

Notes:

- Invite-only is enforced server-side via an allowlist table; no public read access to allowlist.
- RLS baseline is enabled for `profiles`; fuller RLS + audit logging are later phases (PHASE 04–05).

## Local dev (web)

1) Install dependencies

`cd apps/web && npm install`

2) Set env (no secrets committed)

`cp .env.example .env.local`

Then set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

For PHASE 02 (auth), also set (server-only, never `NEXT_PUBLIC_*`):

- `SUPABASE_SERVICE_ROLE_KEY`

3) Run

`npm run dev`

Open `http://localhost:3000`.

## Supabase setup (empty DB)

This repo keeps database schema in SQL migrations under [supabase/migrations](supabase/migrations).

Apply PHASE 02 migration to your Supabase project database before testing auth:

- Option A (recommended): paste/run the SQL in the Supabase Dashboard SQL Editor
	- Migration: [supabase/migrations/202512160001_phase02_auth_invite_only.sql](supabase/migrations/202512160001_phase02_auth_invite_only.sql)
- Option B: run with `psql` using a local `DATABASE_URL` (do not commit it)
	- Example: `psql "$DATABASE_URL" -f supabase/migrations/202512160001_phase02_auth_invite_only.sql`

Security note: if you ever paste credentials into chat or commit history, rotate them in Supabase immediately.

## Notes

- Auth is intentionally not implemented until PHASE 02.
- Supabase Row Level Security (RLS) and audit logging are non-negotiable and will be implemented in later phases.