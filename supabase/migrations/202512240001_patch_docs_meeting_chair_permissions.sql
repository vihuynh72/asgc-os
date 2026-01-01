-- PATCH — Allow committee chairs to manage meeting docs

begin;

drop policy if exists "docs_insert_authenticated" on public.docs;

create policy "docs_insert_authenticated"
  on public.docs
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and not is_deleted
    and (
      doc_type not in ('minutes', 'agenda')
      or public.is_admin(auth.uid())
      or (committee_id is not null and public.is_committee_chair(committee_id))
    )
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

create or replace function public.update_doc(
  _doc_id uuid,
  _title text default null,
  _description text default null,
  _visibility text default null,
  _committee_id uuid default null,
  _meeting_id uuid default null,
  _content_text text default null
)
returns public.docs
language plpgsql
security definer
set search_path = public
as $$
declare
  doc public.docs;
  new_content text;
  next_visibility text;
  next_committee uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into doc from public.docs where id = _doc_id for update;

  if not found then
    raise exception 'doc_not_found';
  end if;

  if doc.uploaded_by <> auth.uid()
    and not public.is_admin(auth.uid())
    and not (doc.committee_id is not null and public.is_committee_chair(doc.committee_id)) then
    raise exception 'forbidden';
  end if;

  if doc.is_deleted then
    raise exception 'doc_deleted';
  end if;

  if _visibility = 'restricted' then
    if not public.is_admin(auth.uid()) and not public.is_executive(auth.uid()) then
      raise exception 'forbidden_visibility';
    end if;
  end if;

  if _content_text is not null and char_length(btrim(_content_text)) = 0 then
    raise exception 'content_text_required';
  end if;

  if doc.doc_type = 'committee_notes' then
    if _visibility is not null and _visibility <> 'committee_only' then
      raise exception 'committee_only_required';
    end if;

    if _committee_id is not null and _committee_id <> doc.committee_id then
      raise exception 'cannot_change_committee';
    end if;

    next_committee := coalesce(_committee_id, doc.committee_id);
    if next_committee is null then
      raise exception 'committee_id_required';
    end if;

    new_content := coalesce(btrim(_content_text), doc.content_text);
  else
    if _content_text is not null then
      raise exception 'content_text_not_allowed';
    end if;

    new_content := doc.content_text;
  end if;

  if doc.doc_type in ('minutes', 'agenda') then
    if _meeting_id is not null and _meeting_id <> doc.meeting_id then
      raise exception 'cannot_change_meeting';
    end if;
  end if;

  next_visibility := coalesce(_visibility, doc.visibility);

  update public.docs
  set
    title = coalesce(nullif(btrim(_title), ''), title),
    description = coalesce(_description, description),
    visibility = next_visibility,
    committee_id = coalesce(_committee_id, committee_id),
    meeting_id = coalesce(_meeting_id, meeting_id),
    content_text = new_content
  where id = _doc_id
  returning * into doc;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'docs.updated',
    'doc',
    _doc_id,
    jsonb_build_object('title', doc.title, 'visibility', doc.visibility)
  );

  return doc;
end;
$$;

revoke all on function public.update_doc(uuid, text, text, text, uuid, uuid, text) from public;
grant execute on function public.update_doc(uuid, text, text, text, uuid, uuid, text) to authenticated;

commit;
