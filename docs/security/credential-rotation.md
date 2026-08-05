# Credential Rotation Checklist

Rotate credentials on the organization-approved schedule, at term or operator turnover, after suspected exposure, and whenever an operator or integration no longer needs access. Treat source control, logs, issue trackers, chat, screenshots, build artifacts, and browser bundles as exposure locations.

## Credential inventory

| Credential | Repository variable | Verification after rotation |
| --- | --- | --- |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` | Authenticated admin APIs, scheduled job, and server-only database operations succeed |
| Supabase browser key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Login and RLS-bound browser operations succeed; old key behavior matches the provider's revocation model |
| Resend API key | `RESEND_API_KEY` | Sign-in, recovery, and one enabled notification email are delivered |
| Twilio account credentials | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | One synthetic SMS verification flow succeeds |
| Twilio messaging service | `TWILIO_MESSAGING_SERVICE_SID` | Messages use the approved sender or service |
| Office Hours OTP secret | `OFFICE_HOURS_KIOSK_OTP_SECRET` | New codes succeed, codes issued under the retired secret fail as expected |
| Scheduled endpoint secret | `CRON_SECRET` | The matching deployment and GitHub Actions values produce an authorized run; the old value is rejected |
| OpenAI API key | `OPENAI_API_KEY` | One synthetic optional AI action succeeds without private records |

`NEXT_PUBLIC_SUPABASE_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMS_PROVIDER`, `OPENAI_MODEL`, `DESIGN_DEFAULT`, and `PROD_BASE_URL` are configuration rather than secret values. Review them during rotation because changing a provider, project, sender, model, or deployment origin can require coordinated credential changes.

## Planned rotation

1. Open a private change record naming the credential, environments, owner, maintenance window, validation plan, and rollback owner.
2. Inventory every location that holds the value, including deployment environments, GitHub Actions secrets, local operator stores, provider settings, and emergency runbooks.
3. Create the replacement credential with the minimum permissions and approved expiration where supported.
4. Update one non-production environment first and complete the relevant checks in the [`../runbook/launch-runbook.md`](../runbook/launch-runbook.md).
5. Update production server-side stores. For `CRON_SECRET`, update the deployment and GitHub Actions secret as one coordinated change.
6. Deploy and verify the exact release. Record status, timestamp, and redacted provider or workflow identifiers, never the value.
7. Revoke the old credential and verify that it no longer works where the provider supports immediate revocation.
8. Review application, workflow, and provider logs for failed clients still using the retired value.
9. Close the change record with operator and reviewer sign-off and the next scheduled rotation date.

## Exposure response

1. Disable or revoke the exposed credential immediately. Do not wait for a code cleanup or history rewrite.
2. Identify affected environments, privileges, logs, commits, artifacts, and time window.
3. Issue a replacement, deploy it, and run the credential-specific verification above.
4. Review provider and application audit records for unauthorized use and preserve evidence privately.
5. Remove the value from the current tree, logs, artifacts, or tickets where possible. If it entered Git, sanitize or replace the public history, but treat that as cleanup after revocation.
6. Record the incident, scope, actions, reviewer, and any user or district notification decision through the approved incident process.

## Evidence rules

Record credential name, environment, provider credential identifier when safe, creation and revocation timestamps, operator, reviewer, verification result, and next rotation date. Never record credential values, recovery codes, full authorization headers, database connection strings, or unredacted provider payloads.
