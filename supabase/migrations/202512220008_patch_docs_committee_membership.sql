-- PATCH — Require committee membership for committee-only docs

begin;

create or replace function public.create_doc(
  _title text,
  _doc_type text,
  _storage_path text default null,
  _storage_bucket text default 'documents',
  _mime_type text default null,
  _size_bytes bigint default null,
  _visibility text default 'internal',
  _committee_id uuid default null,
  _meeting_id uuid default null,
  _description text default null,
  _checksum_sha256 text default null,
  _version_of_doc_id uuid default null,
  _content_text text default null
)
returns public.docs
language plpgsql
security definer
set search_path = public
as $$
declare
  doc public.docs;
  prior_doc public.docs;
  root_id uuid;
  effective_storage_path text;
  effective_meeting_id uuid;
  effective_committee_id uuid;
  visibility_value text;
  trimmed_content text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if _title is null or char_length(btrim(_title)) = 0 then
    raise exception 'title_required';
  end if;

  if _doc_type is null or char_length(btrim(_doc_type)) = 0 then
    raise exception 'doc_type_required';
  end if;

  effective_meeting_id := _meeting_id;
  effective_committee_id := _committee_id;
  visibility_value := coalesce(_visibility, 'internal');
  trimmed_content := case when _content_text is null then null else btrim(_content_text) end;

  if _version_of_doc_id is not null then
    select * into prior_doc from public.docs where id = _version_of_doc_id;

    if not found then
      raise exception 'version_doc_not_found';
    end if;

    root_id := coalesce(prior_doc.version_of_doc_id, prior_doc.id);

    if prior_doc.doc_type <> _doc_type then
      raise exception 'version_doc_type_mismatch';
    end if;

    if prior_doc.meeting_id is not null then
      if effective_meeting_id is null then
        effective_meeting_id := prior_doc.meeting_id;
      elsif effective_meeting_id <> prior_doc.meeting_id then
        raise exception 'version_meeting_mismatch';
      end if;
    end if;

    if prior_doc.committee_id is not null then
      if effective_committee_id is null then
        effective_committee_id := prior_doc.committee_id;
      elsif effective_committee_id <> prior_doc.committee_id then
        raise exception 'version_committee_mismatch';
      end if;
    end if;
  end if;

  if _doc_type = 'committee_notes' then
    if effective_committee_id is null then
      raise exception 'committee_id_required';
    end if;

    if visibility_value <> 'committee_only' then
      raise exception 'committee_only_required';
    end if;

    if trimmed_content is null or char_length(trimmed_content) = 0 then
      raise exception 'content_text_required';
    end if;

    effective_storage_path := null;
  else
    if _storage_path is null or char_length(btrim(_storage_path)) = 0 then
      raise exception 'storage_path_required';
    end if;

    effective_storage_path := btrim(_storage_path);
  end if;

  if _doc_type in ('minutes', 'agenda') and effective_meeting_id is null then
    raise exception 'meeting_id_required';
  end if;

  if visibility_value = 'committee_only' and effective_committee_id is null then
    raise exception 'committee_id_required_for_committee_only';
  end if;

  if visibility_value = 'committee_only' and effective_committee_id is not null then
    if not public.is_admin(auth.uid())
      and not public.is_executive(auth.uid())
      and not public.is_committee_member(effective_committee_id) then
      raise exception 'committee_membership_required';
    end if;
  end if;

  if visibility_value = 'restricted' then
    if not public.is_admin(auth.uid()) and not public.is_executive(auth.uid()) then
      raise exception 'forbidden_visibility';
    end if;
  end if;

  insert into public.docs (
    title,
    doc_type,
    storage_path,
    storage_bucket,
    mime_type,
    size_bytes,
    uploaded_by,
    visibility,
    committee_id,
    meeting_id,
    description,
    checksum_sha256,
    version_of_doc_id,
    content_text
  )
  values (
    btrim(_title),
    _doc_type,
    effective_storage_path,
    _storage_bucket,
    _mime_type,
    _size_bytes,
    auth.uid(),
    visibility_value,
    effective_committee_id,
    effective_meeting_id,
    _description,
    _checksum_sha256,
    root_id,
    case when _doc_type = 'committee_notes' then trimmed_content else null end
  )
  returning * into doc;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'docs.created',
    'doc',
    doc.id,
    jsonb_build_object(
      'title', _title,
      'doc_type', _doc_type,
      'visibility', visibility_value,
      'committee_id', effective_committee_id,
      'meeting_id', effective_meeting_id,
      'version_of_doc_id', root_id
    )
  );

  return doc;
end;
$$;

revoke all on function public.create_doc(
  text,
  text,
  text,
  text,
  text,
  bigint,
  text,
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) from public;

grant execute on function public.create_doc(
  text,
  text,
  text,
  text,
  text,
  bigint,
  text,
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) to authenticated;

commit;
