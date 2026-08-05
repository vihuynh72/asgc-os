# Backups and Retention

## Goals

- Preserve data integrity for audit + finance records.
- Support monthly restore testing.
- Maintain least-privilege access to backup artifacts.

## Requirements

- Supabase CLI 2.111.0 or a compatible newer release. The scripts use the installed CLI when available and otherwise run the pinned release through `npx`.
- Docker or a compatible container runtime for `supabase db dump`.
- A running local stack for the `local` target, or an authenticated and correctly linked project for the `linked` target.
- A restricted backup destination outside this repository.

Both scripts require an explicit target. They refuse to overwrite an existing component directory and stage output before publishing it to the requested destination.

## Database backups

- Run monthly full exports (schema + data).
- Store backups in a separate, access-controlled location.
- Retain at least 12 months of monthly backups; keep year-end snapshots longer if required.
- The database backup contains `roles.sql`, `schema.sql`, and `data.sql` under a `database` directory.

From the repository root, use one of these forms:

```sh
scripts/backup/run_backup.sh linked /secure/backups/asgc-YYYY-MM-DD
scripts/backup/run_backup.sh local /secure/backups/asgc-local-YYYY-MM-DD
```

## Storage backups

- Export storage buckets monthly, especially `documents`, `minutes`, and `receipts`.
- Include `office-hours-kiosk` when the deployment uses kiosk check-in photos.
- Keep receipts/contracts aligned with fiscal retention requirements.
- Validate a sample of documents after restore testing.
- The storage backup contains a recursive JSON manifest and every bucket object under a `storage` directory.

Use the same target and backup root as the database backup:

```sh
scripts/backup/export_storage.sh linked /secure/backups/asgc-YYYY-MM-DD
scripts/backup/export_storage.sh local /secure/backups/asgc-local-YYYY-MM-DD
```

The `linked` target acts on the project recorded by `supabase link`. Confirm that project before running either command. Never place backup output in a public repository.

## Retention guidance (adjust to policy)

- `audit_log`: retain indefinitely.
- `documents` (general): 3 to 7 years.
- `minutes` and `agenda`: permanent or long-term.
- `receipts` and finance docs: 7 years (or per campus policy).

## Storage lifecycle rules

- Apply lifecycle policies at the bucket level to transition or delete old artifacts.
- Suggested: archive after 12 months; delete only when policy allows.

## Restore testing

- Follow `docs/ops/restore-checklist.md` monthly.
