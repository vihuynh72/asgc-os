-- PHASE 47.5 — Fix committee_memberships RLS recursion
-- Use security definer helper to avoid self-referential policy recursion.

begin;

drop policy if exists "committee_memberships_select_same_committee" on public.committee_memberships;

create policy "committee_memberships_select_same_committee"
  on public.committee_memberships
  for select
  to authenticated
  using (public.is_committee_member(committee_memberships.committee_id));

commit;
