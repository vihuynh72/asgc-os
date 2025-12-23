# Backups and Retention

## Goals
- Preserve data integrity for audit + finance records.
- Support monthly restore testing.
- Maintain least-privilege access to backup artifacts.

## Database backups (best practices)
- Run monthly full exports (schema + data).
- Store backups in a separate, access-controlled location.
- Retain at least 12 months of monthly backups; keep year-end snapshots longer if required.

Scripts:
- `scripts/backup/run_backup.sh` (schema + data dumps)

## Storage backups (best practices)
- Export storage buckets monthly, especially `documents`, `minutes`, and `receipts`.
- Keep receipts/contracts aligned with fiscal retention requirements.
- Validate a sample of documents after restore testing.

Scripts:
- `scripts/backup/export_storage.sh`

## Retention guidance (adjust to policy)
- `audit_log`: retain indefinitely.
- `documents` (general): 3-7 years.
- `minutes` and `agenda`: permanent or long-term.
- `receipts` and finance docs: 7 years (or per campus policy).

## Storage lifecycle rules
- Apply lifecycle policies at the bucket level to transition or delete old artifacts.
- Suggested: archive after 12 months; delete only when policy allows.

## Restore testing
- Follow `docs/ops/restore-checklist.md` monthly.
