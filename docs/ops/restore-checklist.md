# Monthly Restore Checklist

## Preparation

- Confirm backup artifacts exist for the month (`database/roles.sql`, `database/schema.sql`, `database/data.sql`, `storage/manifest.json`, and storage objects).
- Verify backup location access is restricted and audited.

## Database restore (staging or local)

1. Create a temporary database or staging project.
2. Restore roles, schema, then data in that order. Stop on the first SQL error.
3. Run integrity checks:
   - Row counts for core tables (profiles, clubs, meetings, finance tables).
   - Verify RLS and policies still exist.
4. Run a small smoke test:
   - Login and open `/clubs`, `/icc`, `/finance`, `/office-hours`.

## Storage restore (sample)

1. Restore a sample set of docs (minutes, receipts, constitutions).
2. Verify file metadata matches `docs` table entries.
3. Confirm download URLs work for authorized users only.

## Post-restore

- Document the results (timestamp, reviewer, issues).
- File a follow-up task for any discrepancies.
