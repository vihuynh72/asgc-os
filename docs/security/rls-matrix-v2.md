# RLS and Privilege Validation Matrix

Use this checklist against a clean database built from the current migrations. It defines tests to run, not evidence that they have passed.

## Current role buckets

- Advisor, global full administrator
- President, term-scoped full administrator
- Executive, term-scoped permissions determined by admin tier and feature policy
- Board member, term-scoped member permissions
- Volunteer, term-scoped limited permissions

The former `director` bucket was removed from active assignments by `202603070001_remove_director_role_and_align_hours.sql`. Display titles can distinguish offices without creating a new authorization bucket.

## Data groups to test

- Identity and auth: `profiles`, `profile_private`, allowlist or blocklist data, role assignments, authentication challenges, and trusted devices
- Office Hours: configuration, requirements, schedules, sessions, presence, verification requests, notification logs, and kiosk photo metadata
- Work management: committees, memberships, projects, tasks, comments, and attachments
- Meetings and documents: meetings, agenda items, notes, document records, summaries, and suggested tasks
- Finance: budget lines, funding requests, votes, expenses, grant cycles, grant applications, and related exports
- Clubs and ICC: clubs, charter checklist and eligibility, ICC meetings, attendance, quorum, and absence state
- Operations: audit events, restricted configuration, storage objects, security views, and callable functions

## Principal matrix

Run representative create, read, update, delete, RPC, view, and storage operations for every applicable data group.

| Principal | Expected boundary |
| --- | --- |
| Anonymous | No private table, view, RPC, or storage access; only explicitly public authentication entry points |
| Authenticated member | Own records and explicitly shared or term-scoped records only |
| Board member or volunteer | Member access plus only the permissions granted to that active role |
| Executive | Feature-specific read or write access; no automatic full-admin assumption |
| President | Current-term full administration as defined by policy |
| Advisor | Global full administration as defined by policy |
| Service role | Technical bypass available only in trusted server or operator contexts, never a browser permission |

## Required checks

1. Confirm RLS is enabled on every table exposed through Supabase APIs.
2. Confirm anonymous grants are absent unless a route is intentionally public and separately rate-limited.
3. Confirm ordinary members cannot read or change another member's private profile, trusted devices, auth challenges, office-hours evidence, or restricted documents.
4. Confirm term-scoped roles lose access when the assignment is expired, future-dated, or belongs to another term.
5. Confirm each admin or finance write is denied to insufficient roles at the database boundary, even when called outside the UI.
6. Confirm views use invoker security when their rows depend on caller RLS, and confirm view grants match the intended principals.
7. Confirm `SECURITY DEFINER` functions have a fixed search path, validate authorization internally, and expose `EXECUTE` only to required roles.
8. Confirm trigger-only and internal helper functions are not executable by anonymous or authenticated users.
9. Confirm storage list, read, upload, replace, move, and delete operations follow the same document or photo authorization as their database records.
10. Confirm service-role keys and clients are absent from browser code, browser responses, and client-visible logs.

## Role helper spot checks

- `is_admin` recognizes only the intended advisor and current-term president cases.
- Admin-tier helpers distinguish full, partial, read-only, and no-admin access where applicable.
- `is_executive` and finance helpers require an active assignment in the correct term.
- Committee helpers cannot be satisfied through a membership in another committee or inactive term.
- Document visibility helpers enforce restricted, committee, and broader visibility consistently in both database rows and storage.

## Evidence

Record the commit SHA, migration state, test users and active roles, SQL or client operation, expected result, observed result, timestamp, and reviewer. Use synthetic identifiers and keep raw production rows, access tokens, private URLs, and credentials out of the repository.

Run [`../../supabase/rls/security_hardening_smoke.sql`](../../supabase/rls/security_hardening_smoke.sql) in addition to this matrix. A successful script does not replace the principal-by-principal live tests above.
