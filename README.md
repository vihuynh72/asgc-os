# ASGC OS

ASGC OS is an internal operations platform for the Associated Students of Grossmont College. It combines office-hours tracking, meetings, documents, projects, finance workflows, clubs, ICC operations, and administrative controls in one access-controlled application.

The source repository can be public, but deployed records remain private. Runtime access is invite-only and enforced through Supabase authentication, database grants, and Row Level Security.

## Current status

The Next.js application, automated tests, TypeScript checks, lint checks, and production build are maintained as the release gate. Live Supabase, email, SMS, cron, storage, and OpenAI integrations require private credentials and must be verified in the target environment before deployment.

## Main capabilities

- Office-hours check-in, presence tracking, timesheets, schedule management, and reporting
- Meetings, agenda intake, minutes, document storage, and task extraction
- Projects, tasks, comments, attachments, and administrative communications
- Budget lines, funding requests, expenses, grants, votes, and exports
- Club charter tracking, ICC meetings, attendance, quorum, and eligibility
- Invite-only authentication, role administration, audit logs, and trusted-device controls

## Repository map

| Path | Purpose |
| --- | --- |
| [`apps/web`](apps/web) | Next.js App Router application and unit tests |
| [`supabase`](supabase) | Local Supabase configuration, migrations, seed file, and RLS smoke checks |
| [`docs/specifications`](docs/specifications) | Original product, architecture, data, security, and office-hours specifications |
| [`docs/governance`](docs/governance) | Constitution and Bylaws source documents |
| [`docs/runbook`](docs/runbook) | Launch and authentication verification procedures |
| [`docs/security`](docs/security) | Threat model, access matrix, log review, and credential rotation guidance |
| [`docs/history`](docs/history) | Historical implementation phase ledger |
| [`scripts/backup`](scripts/backup) | Restricted database and storage backup helpers |

The detailed documentation index is in [`docs/README.md`](docs/README.md).
The final publication gate is in [`docs/public-release-checklist.md`](docs/public-release-checklist.md).

## Governance documents

The governing documents are isolated from application code:

- [ASGC Constitution, repository copy dated 2026-02-27](docs/governance/asgc-constitution-2026-02-27.docx)
- [ASGC Bylaws, updated 2026-02-27](docs/governance/asgc-bylaws-2026-02-27.docx)

See [`docs/governance/README.md`](docs/governance/README.md) before describing either file as an approved or effective public version.

## Local setup

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- Supabase CLI and Docker only when running the database locally

From the repository root:

```sh
nvm use
npm --prefix apps/web ci
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
npm --prefix apps/web run dev
```

Open `http://localhost:3000`. Replace every placeholder in `.env.local` that is needed for the feature being tested. Never commit that file.

## Environment configuration

[`apps/web/.env.example`](apps/web/.env.example) documents all supported variables. The minimum application configuration is:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Email, SMS, AI, and cron variables are optional until those integrations are exercised. Every variable without the `NEXT_PUBLIC_` prefix is server-only.

## Database workflow

Run Supabase CLI commands from the repository root so the CLI uses [`supabase/config.toml`](supabase/config.toml) and the authoritative migrations in [`supabase/migrations`](supabase/migrations).

For a clean local database:

```sh
supabase start
supabase db reset --local
```

For a linked remote project, inspect changes before applying them:

```sh
supabase db push --dry-run
supabase db push
```

Do not commit `supabase/.temp`, local environment files, database dumps, or storage exports. New schema changes must be added as migrations and accompanied by a relevant RLS or permission check.

## Verification

Run the full local gate from `apps/web`:

```sh
npm run check
npm run build
npm audit --omit=dev
```

`npm run check` runs lint, TypeScript, and unit tests. Database and provider integrations are checked separately through the [launch runbook](docs/runbook/launch-runbook.md) because unit tests use mocks.

## Deployment

The web application is designed for a Node-compatible Next.js host. Production also requires a migrated Supabase project, configured authentication redirects, private server environment variables, and the cron secrets described in [`apps/web/README.md`](apps/web/README.md). Complete the [launch runbook](docs/runbook/launch-runbook.md) before opening access.

## Security and contributions

Read [`SECURITY.md`](SECURITY.md) before reporting a vulnerability or handling production data. Development expectations are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

No open-source license has been granted. Public visibility permits viewing the repository but does not grant permission to copy, modify, or redistribute the software or governance documents. ASGC or district authorization is required before adding a software or document license.
