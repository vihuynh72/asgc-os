-- PHASE 17 — Shift scheduling v1 (table + admin create + member view)
-- Source of truth: 01_stack_and_architecture.md (Phase 17), 04_office_hours_spec.md (shifts)

begin;

create extension if not exists pgcrypto;

create table if not exists public.office_hour_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  office_location_id uuid not null references public.office_locations(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_hour_shifts_time_check check (ends_at > starts_at),
  constraint office_hour_shifts_status_check check (status in ('scheduled','cancelled','completed','missed'))
);

create index if not exists office_hour_shifts_user_starts_idx on public.office_hour_shifts (user_id, starts_at);
create index if not exists office_hour_shifts_starts_idx on public.office_hour_shifts (starts_at);

alter table public.office_hour_shifts enable row level security;

create policy "office_hour_shifts_select_own"
  on public.office_hour_shifts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "office_hour_shifts_select_admin"
  on public.office_hour_shifts
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop trigger if exists trg_office_hour_shifts_set_updated_at on public.office_hour_shifts;
create trigger trg_office_hour_shifts_set_updated_at
before update on public.office_hour_shifts
for each row
execute function public.set_updated_at();

-- Admin RPC: create a shift (trusted write path).
create or replace function public.admin_create_office_hour_shift(
  _user_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _office_location_id uuid default null
)
returns public.office_hour_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.office_hour_shifts;
  office_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if _user_id is null then
    raise exception 'user_id_required';
  end if;

  if _starts_at is null or _ends_at is null then
    raise exception 'time_required';
  end if;

  if _ends_at <= _starts_at then
    raise exception 'invalid_time_range';
  end if;

  office_id := _office_location_id;
  if office_id is null then
    select oc.primary_office_location_id into office_id
    from public.office_config oc
    where oc.id = true;
  end if;

  if office_id is null then
    raise exception 'office_config_missing';
  end if;

  insert into public.office_hour_shifts (user_id, office_location_id, starts_at, ends_at, status, created_by)
  values (_user_id, office_id, _starts_at, _ends_at, 'scheduled', auth.uid())
  returning * into created;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'office_hours.shift_created',
    'office_hour_shift',
    created.id,
    jsonb_build_object(
      'user_id', _user_id,
      'office_location_id', office_id,
      'starts_at', _starts_at,
      'ends_at', _ends_at
    )
  );

  return created;
end;
$$;

revoke all on function public.admin_create_office_hour_shift(uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public.admin_create_office_hour_shift(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_create_office_hour_shift(uuid, timestamptz, timestamptz, uuid) to service_role;

-- Member RPC: list shifts for the caller for a week.
create or replace function public.my_office_hour_shifts_week(_week_start date default null)
returns setof public.office_hour_shifts
language sql
stable
as $$
  with b as (
    select * from public.office_week_bounds(_week_start)
  )
  select s.*
  from public.office_hour_shifts s
  join b on true
  where s.user_id = auth.uid()
    and s.starts_at >= b.week_start_ts
    and s.starts_at < b.week_end_ts
  order by s.starts_at asc;
$$;

revoke all on function public.my_office_hour_shifts_week(date) from public;
grant execute on function public.my_office_hour_shifts_week(date) to authenticated;

commit;
