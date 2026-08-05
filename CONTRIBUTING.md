# Contributing

ASGC OS handles operational, identity, finance, and governance data. Changes must preserve access controls and be verifiable without production data.

## Development setup

```sh
nvm use
npm --prefix apps/web ci
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
```

Use private development credentials only. Never copy production records into fixtures, screenshots, issues, or pull requests.

## Change requirements

- Keep application code under `apps/web`, database assets under `supabase`, and durable documentation under `docs`.
- Add or update tests for behavior changes.
- Treat Row Level Security and explicit grants as the authorization boundary. UI hiding is never sufficient.
- Create database changes with `supabase migration new <descriptive_name>` and review the resulting SQL before applying it.
- Add a permission or RLS smoke check for schema changes involving user data, views, functions, or storage.
- Do not modify approved Constitution or Bylaws content without written organizational authorization.

## Required checks

```sh
npm --prefix apps/web run check
npm --prefix apps/web run build
npm --prefix apps/web audit --omit=dev
```

Document any live integration that could not be tested. A successful build does not verify Supabase, email, SMS, cron, storage, or OpenAI configuration.

## Pull requests

Describe the problem, the authorization impact, the tests run, any migration or environment changes, and a rollback path. Do not include secret values, private URLs, personal email addresses, or screenshots containing student records.
