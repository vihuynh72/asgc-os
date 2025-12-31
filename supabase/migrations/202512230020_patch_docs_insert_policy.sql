-- PATCH — Allow authenticated doc inserts with role guards

begin;

drop policy if exists "docs_insert_authenticated" on public.docs;

create policy "docs_insert_authenticated"
  on public.docs
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and not is_deleted
    and (doc_type not in ('minutes', 'agenda') or public.is_admin(auth.uid()))
    and (doc_type not in ('minutes', 'agenda') or meeting_id is not null)
    and (visibility <> 'restricted' or public.is_admin(auth.uid()) or public.is_executive(auth.uid()))
    and (
      visibility <> 'committee_only'
      or (
        committee_id is not null
        and (public.is_admin(auth.uid()) or public.is_executive(auth.uid()) or public.is_committee_member(committee_id))
      )
    )
    and (doc_type <> 'committee_notes' or visibility = 'committee_only')
  );

commit;
