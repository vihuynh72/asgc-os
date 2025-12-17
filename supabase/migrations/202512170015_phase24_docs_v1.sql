-- PHASE 24 — Docs Library v1
-- Source of truth: 02_data_model.md (docs table), 03_security_and_permissions.md (visibility)

begin;

-- 1) Docs table.
create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,
  title text not null,
  storage_path text not null,
  storage_bucket text not null default 'documents',
  mime_type text null,
  size_bytes bigint null,
  uploaded_by uuid null references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  committee_id uuid null references public.committees(id) on delete set null,
  meeting_id uuid null references public.meetings(id) on delete set null,
  visibility text not null default 'internal',
  version_of_doc_id uuid null references public.docs(id) on delete set null,
  checksum_sha256 text null,
  description text null,
  is_deleted boolean not null default false,
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint docs_type_check check (doc_type in ('minutes', 'agenda', 'committee_notes', 'attachment', 'receipt', 'constitution', 'policy', 'report', 'other')),
  constraint docs_visibility_check check (visibility in ('public', 'internal', 'restricted', 'committee_only')),
  constraint docs_title_nonempty check (char_length(btrim(title)) > 0),
  constraint docs_storage_path_nonempty check (char_length(btrim(storage_path)) > 0)
);

create index if not exists docs_doc_type_idx on public.docs (doc_type);
create index if not exists docs_committee_idx on public.docs (committee_id);
create index if not exists docs_meeting_idx on public.docs (meeting_id);
create index if not exists docs_visibility_idx on public.docs (visibility);
create index if not exists docs_uploaded_by_idx on public.docs (uploaded_by);
create index if not exists docs_is_deleted_idx on public.docs (is_deleted);

alter table public.docs enable row level security;

drop trigger if exists trg_docs_set_updated_at on public.docs;
create trigger trg_docs_set_updated_at
before update on public.docs
for each row
execute function public.set_updated_at();

-- 2) Helper function: can user view document?
create or replace function public.can_view_doc(_doc_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  doc_row public.docs;
begin
  select * into doc_row from public.docs where id = _doc_id;

  if not found then
    return false;
  end if;

  if doc_row.is_deleted then
    return public.is_admin(auth.uid());
  end if;

  -- Uploader can always see their own docs
  if doc_row.uploaded_by = auth.uid() then
    return true;
  end if;

  -- Admin can see everything
  if public.is_admin(auth.uid()) then
    return true;
  end if;

  -- Visibility-based access
  case doc_row.visibility
    when 'public' then
      return true;
    when 'internal' then
      return auth.uid() is not null;
    when 'restricted' then
      -- President, VP Finance, Advisor only
      return exists (
        select 1 from public.role_assignments ra
        where ra.user_id = auth.uid()
          and ra.role_key in ('president', 'advisor')
          and ra.ends_at is null
      );
    when 'committee_only' then
      if doc_row.committee_id is null then
        return false;
      end if;
      return exists (
        select 1 from public.committee_memberships cm
        where cm.user_id = auth.uid()
          and cm.committee_id = doc_row.committee_id
      );
    else
      return false;
  end case;
end;
$$;

revoke all on function public.can_view_doc(uuid) from public;
grant execute on function public.can_view_doc(uuid) to authenticated;

-- 3) RLS policies for docs.
create policy "docs_select_own"
  on public.docs
  for select
  to authenticated
  using (uploaded_by = auth.uid() and not is_deleted);

create policy "docs_select_admin"
  on public.docs
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "docs_select_public"
  on public.docs
  for select
  to authenticated
  using (visibility = 'public' and not is_deleted);

create policy "docs_select_internal"
  on public.docs
  for select
  to authenticated
  using (visibility = 'internal' and not is_deleted);

create policy "docs_select_restricted"
  on public.docs
  for select
  to authenticated
  using (
    visibility = 'restricted'
    and not is_deleted
    and exists (
      select 1 from public.role_assignments ra
      where ra.user_id = auth.uid()
        and ra.role_key in ('president', 'advisor')
        and ra.ends_at is null
    )
  );

create policy "docs_select_committee_only"
  on public.docs
  for select
  to authenticated
  using (
    visibility = 'committee_only'
    and not is_deleted
    and committee_id is not null
    and exists (
      select 1 from public.committee_memberships cm
      where cm.user_id = auth.uid()
        and cm.committee_id = docs.committee_id
    )
  );

-- 4) Create doc record RPC (after file upload to storage).
create or replace function public.create_doc(
  _title text,
  _doc_type text,
  _storage_path text,
  _storage_bucket text default 'documents',
  _mime_type text default null,
  _size_bytes bigint default null,
  _visibility text default 'internal',
  _committee_id uuid default null,
  _meeting_id uuid default null,
  _description text default null,
  _checksum_sha256 text default null
)
returns public.docs
language plpgsql
security definer
set search_path = public
as $$
declare
  doc public.docs;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if _title is null or char_length(btrim(_title)) = 0 then
    raise exception 'title_required';
  end if;

  if _storage_path is null or char_length(btrim(_storage_path)) = 0 then
    raise exception 'storage_path_required';
  end if;

  -- Committee-only visibility requires committee_id
  if _visibility = 'committee_only' and _committee_id is null then
    raise exception 'committee_id_required_for_committee_only';
  end if;

  -- Restricted visibility requires admin or exec role
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

  insert into public.docs (
    title, doc_type, storage_path, storage_bucket, mime_type, size_bytes,
    uploaded_by, visibility, committee_id, meeting_id, description, checksum_sha256
  )
  values (
    btrim(_title), _doc_type, btrim(_storage_path), _storage_bucket, _mime_type, _size_bytes,
    auth.uid(), _visibility, _committee_id, _meeting_id, _description, _checksum_sha256
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
      'visibility', _visibility,
      'committee_id', _committee_id,
      'meeting_id', _meeting_id
    )
  );

  return doc;
end;
$$;

revoke all on function public.create_doc(text, text, text, text, text, bigint, text, uuid, uuid, text, text) from public;
grant execute on function public.create_doc(text, text, text, text, text, bigint, text, uuid, uuid, text, text) to authenticated;

-- 5) Update doc metadata RPC.
create or replace function public.update_doc(
  _doc_id uuid,
  _title text default null,
  _description text default null,
  _visibility text default null,
  _committee_id uuid default null,
  _meeting_id uuid default null
)
returns public.docs
language plpgsql
security definer
set search_path = public
as $$
declare
  doc public.docs;
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

  -- Validate visibility change
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

  if _visibility = 'committee_only' and coalesce(_committee_id, doc.committee_id) is null then
    raise exception 'committee_id_required_for_committee_only';
  end if;

  update public.docs
  set
    title = coalesce(nullif(btrim(_title), ''), title),
    description = coalesce(_description, description),
    visibility = coalesce(_visibility, visibility),
    committee_id = coalesce(_committee_id, committee_id),
    meeting_id = coalesce(_meeting_id, meeting_id)
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

revoke all on function public.update_doc(uuid, text, text, text, uuid, uuid) from public;
grant execute on function public.update_doc(uuid, text, text, text, uuid, uuid) to authenticated;

-- 6) Soft delete doc RPC.
create or replace function public.delete_doc(_doc_id uuid)
returns public.docs
language plpgsql
security definer
set search_path = public
as $$
declare
  doc public.docs;
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
    raise exception 'already_deleted';
  end if;

  update public.docs
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = _doc_id
  returning * into doc;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'docs.deleted',
    'doc',
    _doc_id,
    jsonb_build_object('title', doc.title)
  );

  return doc;
end;
$$;

revoke all on function public.delete_doc(uuid) from public;
grant execute on function public.delete_doc(uuid) to authenticated;

-- 7) List docs (with filters).
create or replace function public.list_docs(
  _doc_type text default null,
  _committee_id uuid default null,
  _meeting_id uuid default null,
  _visibility text default null,
  _limit integer default 50,
  _offset integer default 0
)
returns setof public.docs
language sql
stable
as $$
  select d.*
  from public.docs d
  where not d.is_deleted
    and public.can_view_doc(d.id)
    and (_doc_type is null or d.doc_type = _doc_type)
    and (_committee_id is null or d.committee_id = _committee_id)
    and (_meeting_id is null or d.meeting_id = _meeting_id)
    and (_visibility is null or d.visibility = _visibility)
  order by d.uploaded_at desc
  limit _limit
  offset _offset;
$$;

revoke all on function public.list_docs(text, uuid, uuid, text, integer, integer) from public;
grant execute on function public.list_docs(text, uuid, uuid, text, integer, integer) to authenticated;

-- 8) Storage bucket setup (Supabase Storage).
-- Note: Buckets should be created via Supabase Dashboard or separate migration.
-- This inserts bucket records if the storage schema exists.
do $$
begin
  -- Only run if storage.buckets exists
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('documents', 'documents', false, 52428800, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'image/gif', 'text/plain']),
      ('minutes', 'minutes', false, 52428800, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
      ('receipts', 'receipts', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
    on conflict (id) do nothing;
  end if;
end;
$$;

commit;
