# Threat Model (ASGC OS)

## Assets
- Student profiles + role assignments
- Finance records (requests, votes, expenses)
- ICC attendance + club charter data
- Documents (minutes, receipts, constitutions)
- Audit log

## Trust boundaries
- Client browser → API routes (cookie auth)
- API routes → Supabase (service role)
- Supabase RLS → data access enforcement

## Key risks and mitigations
- Unauthorized data access: RLS policies + admin-only APIs.
- Sensitive docs leakage: bucket-private storage + `can_view_doc` checks.
- Privilege escalation: role assignments restricted to admin routes + audit log.
- Data integrity errors: check constraints + server-side validation.
- Audit tampering: append-only audit log + service-role logging.

## High-risk flows
- Admin CRUD for finance, clubs, ICC attendance.
- Doc uploads (receipts, constitutions).
- Role assignment + term rollover.

## Review cadence
- Quarterly review of RLS policies and admin routes.
- Monthly audit log spot checks.
