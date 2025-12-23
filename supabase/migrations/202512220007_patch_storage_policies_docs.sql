-- PATCH — Storage policies for docs buckets
-- Ensures authenticated users can upload/download docs via signed URLs while enforcing doc-level visibility.

begin;

do $$
declare
  objects_owner name;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    select tableowner
      into objects_owner
      from pg_catalog.pg_tables
     where schemaname = 'storage' and tablename = 'objects';

    -- Supabase-hosted projects often have storage tables owned by a platform role.
    -- Attempt to assume the owning/admin role when possible; otherwise skip instead
    -- of failing the entire migration run.
    begin
      if objects_owner is not null and pg_catalog.pg_has_role(current_user, objects_owner, 'member') then
        execute format('set local role %I', objects_owner);
      elsif pg_catalog.pg_has_role(current_user, 'supabase_storage_admin', 'member') then
        execute 'set local role supabase_storage_admin';
      elsif pg_catalog.pg_has_role(current_user, 'supabase_admin', 'member') then
        execute 'set local role supabase_admin';
      end if;
    exception
      when others then
        -- Ignore failures to change role; we will attempt DDL and handle privilege errors.
        null;
    end;

    begin
      alter table storage.objects enable row level security;

      drop policy if exists "storage_objects_select_docs" on storage.objects;
      drop policy if exists "storage_objects_insert_docs" on storage.objects;
      drop policy if exists "storage_objects_delete_docs_admin" on storage.objects;

      create policy "storage_objects_select_docs"
        on storage.objects
        for select
        to authenticated
        using (
          bucket_id in ('documents', 'minutes', 'receipts')
          and exists (
            select 1
            from public.docs d
            where d.storage_bucket = storage.objects.bucket_id
              and d.storage_path = storage.objects.name
              and public.can_view_doc(d.id)
          )
        );

      create policy "storage_objects_insert_docs"
        on storage.objects
        for insert
        to authenticated
        with check (
          bucket_id in ('documents', 'minutes', 'receipts')
          and name like (auth.uid()::text || '/%')
        );

      create policy "storage_objects_delete_docs_admin"
        on storage.objects
        for delete
        to authenticated
        using (public.is_admin(auth.uid()));
    exception
      when insufficient_privilege then
        raise notice 'Skipping storage.objects policy changes due to insufficient privilege for role % (owner=%).', current_user, objects_owner;
    end;
  end if;
end;
$$;

commit;
