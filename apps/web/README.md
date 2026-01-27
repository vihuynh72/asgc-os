ASGC OS web app (Next.js App Router + TypeScript).

This folder is the Next.js app for the repo.

For overall architecture, phases, and the “source of truth” build packet, start at the repo root README:
- [../../README.md](../../README.md)

## Local dev

From this directory:

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Required env

Public (browser-safe):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only:
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (used for `/api/cron/*` routes; Vercel cron sends `Authorization: Bearer $CRON_SECRET`)

### Vercel cron schedule notes

- Vercel Hobby cron precision is hourly; Pro supports per-minute schedules.
- The Office Hours “presence timeout” uses a strict 15-minute cutoff based on the last successful heartbeat, but the session may not be marked closed in the DB/UI until the next cron run (unless the user returns and triggers a heartbeat).

PHASE 10 notifications (server-only):
- `EMAIL_PROVIDER` (set to `resend`)
- `EMAIL_FROM`
- `RESEND_API_KEY`

### Useful commands

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
```

## Key locations

- App routes: [src/app](src/app)
- API routes: [src/app/api](src/app/api)
- Middleware (auth/admin gates): [src/middleware.ts](src/middleware.ts)
- Supabase clients:
	- Browser: [src/lib/supabaseClient.ts](src/lib/supabaseClient.ts)
	- Server components: [src/lib/supabaseServerComponent.ts](src/lib/supabaseServerComponent.ts)
	- Service role (admin): [src/lib/supabaseAdmin.ts](src/lib/supabaseAdmin.ts)
