-- PHASE 11 — Office config (single office) + quiet hours
-- Source of truth: 01_stack_and_architecture.md (Phase 11), 04_office_hours_spec.md (quiet hours), existing Phase 06 office_locations

begin;

create extension if not exists pgcrypto;

-- 1) Singleton config table (1-row) to store org-wide office policy.
-- Keep office_locations focused on geofence/timezone; quiet hours is notification policy.
create table if not exists public.office_config (
  id boolean primary key default true,
  primary_office_location_id uuid not null references public.office_locations(id) on delete restrict,

  quiet_hours_enabled boolean not null default true,
  quiet_hours_start_local time not null default '21:00',
  quiet_hours_end_local time not null default '08:00',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint office_config_singleton check (id = true),
  constraint office_config_quiet_hours_window_check check (
    not quiet_hours_enabled or quiet_hours_start_local <> quiet_hours_end_local
  )
);

alter table public.office_config enable row level security;

-- Readable by authenticated users (not sensitive), but writable only via service role.
create policy "office_config_select_authenticated"
  on public.office_config
  for select
  to authenticated
  using (true);

revoke all on table public.office_config from authenticated;
grant select on table public.office_config to authenticated;

drop trigger if exists trg_office_config_set_updated_at on public.office_config;
create trigger trg_office_config_set_updated_at
before update on public.office_config
for each row
execute function public.set_updated_at();

-- Seed singleton row pointing at the oldest office location (Phase 06 seeds one).
insert into public.office_config (id, primary_office_location_id)
select true, (select id from public.office_locations order by created_at asc limit 1)
where not exists (select 1 from public.office_config);

-- 2) Helper: resolve office timezone from config.
create or replace function public.office_timezone()
returns text
language sql
stable
as $$
  select coalesce(ol.timezone, 'America/Los_Angeles')
  from public.office_config oc
  join public.office_locations ol on ol.id = oc.primary_office_location_id
  where oc.id = true
  limit 1;
$$;

revoke all on function public.office_timezone() from public;
grant execute on function public.office_timezone() to authenticated;

-- 3) Helper: quiet-hours check for a timestamp (spans-midnight safe).
create or replace function public.is_quiet_hours(ts timestamptz default now())
returns boolean
language plpgsql
stable
as $$
declare
  enabled boolean;
  start_t time;
  end_t time;
  tz text;
  local_t time;
begin
  select quiet_hours_enabled, quiet_hours_start_local, quiet_hours_end_local
    into enabled, start_t, end_t
  from public.office_config
  where id = true;

  if not found or not enabled then
    return false;
  end if;

  tz := public.office_timezone();
  local_t := (ts at time zone tz)::time;

  -- If start < end, window is same-day. If start > end, window spans midnight.
  if start_t < end_t then
    return (local_t >= start_t) and (local_t < end_t);
  else
    return (local_t >= start_t) or (local_t < end_t);
  end if;
end;
$$;

revoke all on function public.is_quiet_hours(timestamptz) from public;
grant execute on function public.is_quiet_hours(timestamptz) to authenticated;

-- 4) Patch Phase 06 week helper + rollup to use configured timezone.
create or replace function public.office_hours_week_start_date(ts timestamptz default now())
returns date
language sql
stable
as $$
  select (date_trunc('week', (ts at time zone public.office_timezone()))::date);
$$;

create or replace function public.my_weekly_hours()
returns table (
  user_id uuid,
  week_start date,
  total_minutes bigint,
  in_office_minutes bigint,
  deficit_minutes bigint,
  deficit_in_office_minutes bigint
)
language sql
stable
as $$
  with
  u as (
    select auth.uid() as user_id
  ),
  wk as (
    select public.office_hours_week_start_date(now()) as week_start
  ),
  tz as (
    select public.office_timezone() as tz
  ),
  role_sel as (
    select public.primary_role_key_for_requirements((select user_id from u)) as role_key
  ),
  req as (
    select
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes,
      coalesce(ohr.weekly_in_office_hours, 0) * 60 as req_in_office_minutes
    from public.office_hour_requirements ohr
    join role_sel rs on rs.role_key = ohr.role_key
    left join public.terms t on t.id = ohr.term_id
    where (ohr.term_id is null or ohr.term_id = public.current_term_id())
      and (ohr.effective_start is null or ohr.effective_start <= (select week_start from wk))
      and (ohr.effective_end is null or ohr.effective_end >= (select week_start from wk))
    order by
      case when ohr.term_id is null then 1 else 0 end,
      ohr.effective_start desc nulls last,
      ohr.created_at desc
    limit 1
  ),
  session_minutes as (
    select
      coalesce(sum(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0), 0)::bigint as total_minutes,
      coalesce(sum(
        case when coalesce(s.within_radius, false) then extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0 else 0 end
      ), 0)::bigint as in_office_minutes
    from public.office_hour_sessions s
    join u on u.user_id = s.user_id
    join wk on true
    join tz on true
    where s.checkout_at is not null
      and s.status in ('closed','auto_closed')
      and (s.checkin_at at time zone tz.tz) >= (wk.week_start::timestamp)
      and (s.checkin_at at time zone tz.tz) < ((wk.week_start + 7)::timestamp)
  ),
  exception_minutes as (
    select
      coalesce(sum(case when e.kind = 'total' then e.minutes else 0 end), 0)::bigint as total_minutes,
      coalesce(sum(case when e.kind = 'in_office' then e.minutes else 0 end), 0)::bigint as in_office_minutes
    from public.office_hour_exceptions e
    join u on u.user_id = e.user_id
    join wk on wk.week_start = e.week_start_date
  ),
  totals as (
    select
      (select user_id from u) as user_id,
      (select week_start from wk) as week_start,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      (sm.in_office_minutes + em.in_office_minutes) as in_office_minutes,
      (select req_total_minutes from req) as req_total_minutes,
      (select req_in_office_minutes from req) as req_in_office_minutes
    from session_minutes sm, exception_minutes em
  )
  select
    user_id,
    week_start,
    total_minutes,
    in_office_minutes,
    greatest(coalesce(req_total_minutes, 0) - total_minutes, 0) as deficit_minutes,
    greatest(coalesce(req_in_office_minutes, 0) - in_office_minutes, 0) as deficit_in_office_minutes
  from totals;
$$;

commit;
