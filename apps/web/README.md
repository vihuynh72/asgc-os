# ASGC OS Web Application

This directory contains the Next.js App Router application, API routes, shared components, and unit tests. Repository-wide setup, architecture, governance, and release information starts in [`../../README.md`](../../README.md).

## Setup

From the repository root:

```sh
nvm use
npm --prefix apps/web ci
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
npm --prefix apps/web run dev
```

Open `http://localhost:3000`.

## Environment groups

Required for authenticated application routes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Required only for their integrations:

- Cron: `CRON_SECRET`
- Email: `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`
- SMS: `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `OFFICE_HOURS_KIOSK_OTP_SECRET`
- AI helpers: `OPENAI_API_KEY`, optional `OPENAI_MODEL`
- UI default: optional `DESIGN_DEFAULT=v1|v2`

Use [`.env.example`](.env.example) as the key inventory. Only `NEXT_PUBLIC_*` values are browser-visible. Every other value must remain server-only.

## Commands

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npm run check
npm run build
npm audit --omit=dev
```

`npm run check` is the local lint, TypeScript, and unit-test gate. Unit tests mock external providers and do not prove that a live Supabase project, cron job, email provider, SMS provider, storage bucket, or OpenAI account is configured.

## Scheduled job

The production Office Hours scheduler calls `/api/cron/office-hours-reminders` every five minutes, the shortest interval supported by GitHub Actions. The workflow requires repository secrets named `PROD_BASE_URL` and `CRON_SECRET`. The deployed application must use the same `CRON_SECRET`.

## Key locations

- Application pages and route handlers: [`src/app`](src/app)
- Shared UI: [`src/components`](src/components)
- Application and provider helpers: [`src/lib`](src/lib)
- Auth and admin route gating: [`src/proxy.ts`](src/proxy.ts)
- Tests: [`test`](test)
- Database configuration and migrations: [`../../supabase`](../../supabase)
