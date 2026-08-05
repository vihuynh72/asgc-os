# Launch Runbook

Use this checklist against the exact environment that will be opened to users. Record evidence without copying secrets, access tokens, private URLs, student records, phone numbers, or full provider payloads into the repository.

## Release record

Record this information in the private release ticket or approval record:

| Field | Evidence |
| --- | --- |
| Environment | Staging or production |
| Git commit | Full commit SHA |
| Deployment | Provider deployment ID and UTC timestamp |
| Database | Supabase project identifier, partially redacted if required |
| Operator | Name or approved operator identifier |
| Reviewer | Independent reviewer |
| Test data | Synthetic account and record identifiers only |

Every check below needs a pass result, timestamp, operator, and a private evidence link. Mark a check blocked when its provider or approval is unavailable. Do not infer success from configuration alone.

## 1. Build and deployment identity

- [ ] Confirm the deployed commit matches the commit in the release record.
- [ ] Confirm CI passed `npm run check`, `npm run build`, and `npm audit --omit=dev` for that commit.
- [ ] Confirm the deployment uses Node.js 22.x.
- [ ] Confirm the public base URL uses HTTPS and the expected custom domain.
- [ ] Confirm health, login, and static application pages return the expected status without exposing debug details.

Evidence: CI run URL, deployment ID, commit SHA, and redacted status results.

## 2. Environment and redirect configuration

- [ ] Compare the deployed variable names with `apps/web/.env.example`; record names and presence only, never values.
- [ ] Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` identify the intended Supabase project.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is server-only and absent from browser bundles, page source, and client-visible logs.
- [ ] Confirm Supabase authentication site URL and allowed redirect URLs contain only approved HTTPS destinations.
- [ ] Confirm provider secrets are stored in the deployment or repository secret store, not source files or workflow output.

Evidence: redacted configuration screenshots or provider-setting links and a browser-source inspection result.

## 3. Database migrations and authorization

From the repository root, review the target migration plan before applying it:

```sh
supabase start
supabase db reset --local
supabase db push --dry-run
supabase db push
```

- [ ] Save the dry-run migration list and reviewer approval before the push.
- [ ] Confirm the applied remote migration list matches the reviewed repository migrations.
- [ ] Confirm `supabase db reset --local` builds a clean local database from `supabase/migrations` without manual SQL repair.
- [ ] Run `supabase/rls/security_hardening_smoke.sql` with stop-on-error enabled in an approved SQL runner.
- [ ] Test an anonymous session, an ordinary authenticated member, each supported term role, and an admin account against representative profile, office-hours, finance, club, ICC, document, and storage operations.
- [ ] Confirm denied operations fail at the database or storage policy boundary, even when attempted outside the normal UI.
- [ ] Confirm internal helper functions and trigger-only functions are not executable by anonymous or authenticated callers.

Evidence: migration output, smoke-script result, and a redacted authorization matrix. Never attach database connection strings or service-role values.

## 4. Authentication and account security

Complete every applicable scenario in [`auth-smoke-matrix.md`](auth-smoke-matrix.md).

- [ ] Verify invite or allowlist enforcement with an approved domain account and a synthetic disallowed address.
- [ ] Verify returning-member, first-time, password-reset, trusted-device, untrusted-device, and MFA recovery behavior.
- [ ] Verify protected routes redirect or reject anonymous users.
- [ ] Verify an ordinary member cannot enter admin routes or invoke admin-only actions.
- [ ] Verify sign-out clears the active session and a revoked trusted device cannot be reused.
- [ ] Confirm login, recovery, and OTP errors do not reveal whether an address, member, or phone number exists.

Evidence: completed auth matrix, redacted screenshots, timestamps, and relevant provider message IDs.

## 5. Email delivery

- [ ] Send a first-time sign-in or verification message to a synthetic approved mailbox.
- [ ] Send a password-reset message and complete the recovery flow.
- [ ] Exercise one administrative or office-hours email notification when that feature is enabled.
- [ ] Confirm sender identity, links, expiry behavior, and production URL are correct.
- [ ] Confirm logs and UI responses omit provider credentials and private message bodies.

Evidence: provider delivery status, partially redacted message ID, receipt time, and completed link result.

## 6. SMS and Office Hours verification

Complete this section only when SMS is enabled.

- [ ] Send a kiosk or Office Hours verification code to an approved synthetic test number.
- [ ] Confirm one valid code succeeds once, then cannot be replayed.
- [ ] Confirm expired and invalid codes fail with generic responses.
- [ ] Confirm repeated requests trigger the configured member, phone, and request-IP limits.
- [ ] Confirm application logs omit the phone number, code, Twilio credentials, and full provider payload.

Evidence: partially redacted Twilio message ID, timestamps, and pass or deny results.

## 7. Scheduled job

- [ ] Confirm the deployment and GitHub Actions repository hold matching `CRON_SECRET` values without printing them.
- [ ] Confirm `PROD_BASE_URL` is the intended HTTPS origin.
- [ ] Manually dispatch the Office Hours cron workflow and confirm a 2xx result.
- [ ] Call the endpoint without authorization in a controlled test and confirm it is rejected.
- [ ] Confirm workflow logs contain only the HTTP status and no response body, token, private URL parameters, or member data.
- [ ] Confirm the schedule and timezone implications match the intended Office Hours policy.

Evidence: workflow run URL, UTC execution time, status code, and redacted application-log result.

## 8. Storage and documents

- [ ] Upload a synthetic document through the application and confirm the database record and private object are created.
- [ ] Confirm an authorized user can download the object through the intended signed or authenticated flow.
- [ ] Confirm an anonymous user and an unauthorized member cannot list, read, replace, or delete it.
- [ ] Exercise a representative restricted finance or governance-related document without using a real record.
- [ ] Confirm signed URLs expire and are not written to durable logs or tickets.

Evidence: synthetic object path, redacted authorization results, and expiry time.

## 9. Optional AI integration

Complete this section only when OpenAI document helpers are enabled.

- [ ] Process a synthetic, non-sensitive document through each enabled AI action.
- [ ] Confirm the configured model succeeds and failures return a safe application error.
- [ ] Confirm prompts, outputs, and provider logs contain no production personal or financial records.

Evidence: timestamp, synthetic document ID, model name, and redacted result.

## 10. Backup and recovery

- [ ] Confirm `supabase link` identifies the intended target project.
- [ ] Run `scripts/backup/run_backup.sh linked <restricted-backup-root>` and `scripts/backup/export_storage.sh linked <restricted-backup-root>` outside the repository.
- [ ] Confirm created artifacts are readable only by the operator or approved backup service.
- [ ] Confirm the database backup contains non-empty `roles.sql`, `schema.sql`, and `data.sql`, and the storage backup contains `manifest.json` plus every expected bucket.
- [ ] Restore the roles, schema, data, and representative storage objects into a disposable local or staging environment.
- [ ] Complete [`../ops/restore-checklist.md`](../ops/restore-checklist.md), including row, policy, storage, and authorized-download checks.
- [ ] Delete or transfer disposable local artifacts according to the approved retention process.

Evidence: backup timestamp, artifact inventory without contents, permission check, restore result, and reviewer sign-off.

## 11. Operational readiness

- [ ] Confirm the current term, role assignments, allowlist entries, office locations, requirements, committees, and scheduled meetings are correct.
- [ ] Confirm audit-log review, credential rotation, incident response, backup ownership, and support ownership have named operators.
- [ ] Confirm branch protection and required CI checks are enabled on the public default branch.
- [ ] Confirm governance approval, license decision, and Git history review in [`../public-release-checklist.md`](../public-release-checklist.md) are complete.

## Release decision

Release only when every applicable item has direct evidence and an independent reviewer has signed off. List any non-applicable section with the reason. An unresolved security, migration, history, governance, or recovery check blocks public launch.
