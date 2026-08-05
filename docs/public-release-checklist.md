# Public release checklist

Complete this checklist before changing repository visibility or submitting the repository as a finished public deliverable.

## Repository and history

- [ ] Publish from a clean repository history, or complete an authorized history rewrite. Earlier commits contain identity-specific bootstrap email addresses and large local Supabase CLI binaries even though the current tree no longer does.
- [ ] Confirm the intended public branch contains no environment files, credentials, database dumps, storage exports, or `supabase/.temp` state.
- [ ] Enable required CI checks and branch protection for the public default branch.

Creating a new repository from one reviewed snapshot is the safest option when preserving the private development history is unnecessary. Do not make the existing remote public until this item is resolved.

## Governance and legal approval

- [ ] Have an authorized ASGC or district representative confirm the approval status and effective date of both files in [`governance`](governance).
- [ ] Have that representative correct or explicitly accept the stale Bylaws page references documented in [`governance/README.md`](governance/README.md).
- [ ] Decide whether ASGC or the district will grant a software license, a document license, both, or neither. Public visibility alone grants no reuse rights.
- [ ] Confirm the repository name, owner, contact route, and public description with the submitting organization.

## Application and database

- [ ] Run `npm run check`, `npm run build`, and `npm audit --omit=dev` from `apps/web` on the final commit.
- [ ] Reset a clean local Supabase database from [`../supabase/migrations`](../supabase/migrations) and run [`../supabase/rls/security_hardening_smoke.sql`](../supabase/rls/security_hardening_smoke.sql).
- [ ] Apply the reviewed migrations to the target project with `supabase db push --dry-run` followed by `supabase db push`.
- [ ] Complete the [`runbook/launch-runbook.md`](runbook/launch-runbook.md) checks against the target environment, including authentication, permissions, email, SMS, cron, storage, and backup recovery.

## Publication decision

The repository is ready to become public only when every applicable item above has direct evidence. A successful local build does not prove that the deployed integrations, governance approvals, Git history, or licensing decision are complete.
