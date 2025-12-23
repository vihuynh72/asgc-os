# RLS Matrix v2 (Checklist)

Use this checklist to validate that RLS policies align with the permission matrix.

## Roles
- Advisor (global admin)
- President (term admin)
- Executive (term)
- Director (term)
- Board member (term)
- Volunteer (term)

## Core tables
- profiles / profile_private
- role_assignments
- clubs / club_charter_checklist / club_eligibility
- icc_meetings / icc_attendance
- docs
- finance tables (budget_lines, funding_requests, board_votes, expenses, grants)

## Validation steps (per table)
1. Anonymous user cannot access.
2. Authenticated non-admin can read only permitted rows.
3. Admin can read all and write via server routes only.
4. Service role bypass is limited to admin APIs.

## Spot checks
- Verify `is_admin` matches advisor/president only.
- Ensure finance policies use `is_finance_admin` and `is_executive`.
- Confirm club/ICC tables are admin-write only.
