-- PHASE 25/26 - Minutes upload v1 + Committee notes spaces
-- Source of truth: 02_data_model.md (docs), 01_stack_and_architecture.md

begin;

-- 1) Docs enhancements for minutes + committee notes.
alter table public.docs
  add column if not exists content_text text null;

alter table public.docs
  alter column storage_path drop not null;

alter table public.docs
  drop constraint if exists docs_storage_path_nonempty;

alter table public.docs
  drop constraint if exists docs_content_text_nonempty;

alter table public.docs
  drop constraint if exists docs_storage_path_required;

alter table public.docs
  drop constraint if exists docs_committee_notes_rules;

alter table public.docs
  drop constraint if exists docs_meeting_required;

alter table public.docs
  add constraint docs_content_text_nonempty
  check (content_text is null or char_length(btrim(content_text)) > 0);

alter table public.docs
  add constraint docs_storage_path_required
  check (
    (doc_type = 'committee_notes' and content_text is not null and char_length(btrim(content_text)) > 0)
    or (doc_type <> 'committee_notes' and storage_path is not null and char_length(btrim(storage_path)) > 0)
  );

alter table public.docs
  add constraint docs_committee_notes_rules
  check (
    doc_type <> 'committee_notes'
    or (committee_id is not null and visibility = 'committee_only')
  );

alter table public.docs
  add constraint docs_meeting_required
  check (
    doc_type not in ('minutes', 'agenda')
    or meeting_id is not null
  );

create index if not exists docs_version_root_idx on public.docs (version_of_doc_id);

-- 2) Update create_doc to support versions + committee notes content.

drop function if exists public.create_doc(
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
  text
);

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

  -- Committee-only visibility requires committee_id
  if visibility_value = 'committee_only' and effective_committee_id is null then
    raise exception 'committee_id_required_for_committee_only';
  end if;

  -- Restricted visibility requires admin or exec role
  if visibility_value = 'restricted' then
    if not public.is_admin(auth.uid()) and not exists (
      select 1 from public.role_assignments ra
      where ra.user_id = auth.uid()
        and ra.role_key in ('president', 'advisor')
        and ra.ends_at is null
    ) then
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

-- 3) Update update_doc to allow committee notes edits.

drop function if exists public.update_doc(uuid, text, text, text, uuid, uuid);

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

  if doc.uploaded_by <> auth.uid() and not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if doc.is_deleted then
    raise exception 'doc_deleted';
  end if;

  if _visibility = 'restricted' then
    if not public.is_admin(auth.uid()) and not exists (
      select 1 from public.role_assignments ra
      where ra.user_id = auth.uid()
        and ra.role_key in ('president', 'advisor')
        and ra.ends_at is null
    ) then
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
