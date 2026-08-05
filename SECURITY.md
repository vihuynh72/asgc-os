# Security Policy

## Reporting

Do not open a public issue for a suspected vulnerability, exposed credential, personal record, or authorization bypass. Use the repository's private GitHub security advisory flow or contact the repository maintainers through an established private ASGC channel.

Include the affected route, migration, or commit, the minimum reproduction steps, the expected authorization boundary, and the observed result. Redact credentials and personal data.

## Scope

Security reports should cover the current default branch and the deployed version if it differs. High-priority areas include authentication, role assignment, Row Level Security, service-role usage, storage access, finance data, office-hours records, cron authentication, and provider credentials.

## Credential exposure

If a real secret enters a commit, log, issue, or chat, revoke and rotate it immediately. Deleting the current file is insufficient because Git history and caches may retain the value. Follow [`docs/security/credential-rotation.md`](docs/security/credential-rotation.md).

## Data handling

Use synthetic records for testing. Production exports and backups must be encrypted, access-controlled, stored outside the repository, and handled according to ASGC and district retention policy.
