# Threat Model

This model describes the current ASGC OS architecture. Recheck it whenever authentication, service-role usage, storage, scheduled jobs, or external providers change.

## Protected assets

- Student profiles, private contact fields, role assignments, trusted devices, and authentication challenges
- Office-hours sessions, schedules, presence data, verification codes, and kiosk photos
- Finance requests, votes, expenses, receipts, grants, and exports
- Meetings, minutes, committee notes, club and ICC records, and stored documents
- Audit events, configuration, database and storage backups, and retention records
- Supabase, deployment, email, SMS, cron, and OpenAI credentials

## Actors

- Anonymous internet users
- Authenticated members with term-scoped roles
- Presidents and advisors with full administrative access
- Executives or other roles with narrower feature permissions
- Application operators and provider administrators
- GitHub Actions invoking the scheduled Office Hours endpoint
- Email, SMS, hosting, Supabase, storage, and optional AI providers

## Trust boundaries and data flows

1. The browser talks directly to Supabase Auth and, for selected features, Supabase data or realtime APIs through the public URL and anon or publishable key. The user session and Row Level Security must limit these requests.
2. The browser sends cookie-authenticated requests to Next.js pages, the route-gating proxy, and API routes. Server code must validate the user and authorization before acting.
3. Next.js server code uses user-session Supabase clients when Row Level Security should decide access. Explicit admin routes and scheduled jobs may use the service-role client only after their own authorization checks.
4. Supabase Postgres, RPCs, views, and Storage policies enforce the database and object authorization boundary. `SECURITY DEFINER` functions require a fixed search path and minimum execution grants.
5. Next.js sends limited data to email, SMS, and optional AI providers. Provider credentials remain server-only, and production records must not be sent unless the feature and data handling are approved.
6. GitHub Actions calls the scheduled endpoint over HTTPS with a shared bearer secret. Workflow and application logs must not contain that secret or private response bodies.
7. Backup scripts move database or storage copies across the production boundary into a separate restricted system. Backups require access controls, retention, recovery testing, and safe disposal.

## Primary threats and required controls

| Threat | Required controls |
| --- | --- |
| Anonymous or cross-user data access | RLS on exposed tables, storage policies, invoker-security views, explicit grants, and negative authorization tests |
| Privilege escalation | Server-side role checks, restricted role-assignment paths, audit events, and no reliance on hidden UI controls |
| Service-role misuse | Server-only secret storage, narrow admin routes, authenticated authorization before use, and no client bundle or log exposure |
| Unsafe database functions | Fixed `search_path`, least-privilege `EXECUTE`, inaccessible internal helpers, input validation, and RLS smoke tests |
| Account or member enumeration | Generic auth and OTP responses, request throttling, expiry, one-time codes, and trusted-device revocation |
| Cron forgery or leakage | HTTPS, bearer-secret validation, minimal workflow permissions, no redirects, bounded requests, and status-only logs |
| Document or photo disclosure | Private buckets, short-lived signed URLs, policy checks, quarantine controls, and denial tests for unauthorized users |
| Malicious uploads or generated content | File type and size limits, private storage, output escaping, and manual review of sensitive generated artifacts |
| Secret or personal-data exposure in Git | Ignore rules, pre-publication current-tree and history scans, immediate credential rotation, and clean-history publication |
| Backup theft or unusable recovery | Restricted artifact permissions, encrypted external storage where required, retention ownership, and recurring restore tests |
| Dependency or build compromise | Lockfile-based installs, CI checks, dependency audit, reviewed updates, and protected release branches |

## Security assumptions

- Supabase projects and external provider accounts use organization-controlled access and MFA where supported.
- Production credentials are available only to approved operators and server runtimes.
- Role, retention, governance, and provider-data policies are approved outside this repository.
- Tests use synthetic records. A local build or mocked unit test does not prove live authorization or provider behavior.

## Verification and review

- Run the current RLS and function checks after every schema authorization change.
- Complete the [`../runbook/launch-runbook.md`](../runbook/launch-runbook.md) before launch and after material provider changes.
- Review audit events and provider logs on the documented cadence.
- Review this threat model at least quarterly and after any incident, new provider, public endpoint, role change, or new category of personal data.
