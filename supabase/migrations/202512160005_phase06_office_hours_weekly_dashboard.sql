-- PHASE 06 — Dashboard v1 ("my hours this week")
-- Adds minimal Office Hours tables + weekly rollup RPC (read-only)
-- Source of truth: 01_stack_and_architecture.md (PHASE 06), 02_data_model.md (OFFICE HOURS), 04_office_hours_spec.md (weekly compliance)

begin;

create extension if not exists pgcrypto;

-- 1) Office locations (config; full lat/lon used in later phases)
create table if not exists public.office_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision null,
  lon double precision null,
  radius_m integer null,
  grace_radius_m integer null,
  timezone text not null default 'America/Los_Angeles',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_locations_name_nonempty check (char_length(btrim(name)) > 0)
);

alter table public.office_locations enable row level security;

create policy "office_locations_select_authenticated"
  on public.office_locations
  for select
  to authenticated
  using (true);

drop trigger if exists trg_office_locations_set_updated_at on public.office_locations;
create trigger trg_office_locations_set_updated_at
before update on public.office_locations
for each row
execute function public.set_updated_at();

-- Seed a default location (idempotent) so dashboards can render consistently.
insert into public.office_locations (name, timezone, active)
select 'ASGC Office', 'America/Los_Angeles', true
where not exists (select 1 from public.office_locations);

-- 2) Office hour requirements (configured later in Phase 12)
create table if not exists public.office_hour_requirements (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references public.roles(role_key) on delete restrict,
  term_id uuid null references public.terms(id) on delete restrict,
  weekly_total_hours integer not null default 0,
  weekly_in_office_hours integer not null default 0,
  effective_start date null,
  effective_end date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_hour_requirements_nonnegative check (weekly_total_hours >= 0 and weekly_in_office_hours >= 0),
  constraint office_hour_requirements_effective_check check (effective_start is null or effective_end is null or effective_start <= effective_end)
);

create index if not exists office_hour_requirements_role_key_idx on public.office_hour_requirements (role_key);
create index if not exists office_hour_requirements_term_id_idx on public.office_hour_requirements (term_id);

alter table public.office_hour_requirements enable row level security;

create policy "office_hour_requirements_select_authenticated"
  on public.office_hour_requirements
  for select
  to authenticated
  using (true);

drop trigger if exists trg_office_hour_requirements_set_updated_at on public.office_hour_requirements;
create trigger trg_office_hour_requirements_set_updated_at
before update on public.office_hour_requirements
for each row
execute function public.set_updated_at();

-- Seed zero requirements for known roles (idempotent). Real values come in Phase 12 config.
insert into public.office_hour_requirements (role_key, term_id, weekly_total_hours, weekly_in_office_hours)
select r.role_key, null, 0, 0
from public.roles r
where r.role_key in ('president','officer','volunteer')
  and not exists (
    select 1 from public.office_hour_requirements ohr where ohr.role_key = r.role_key and ohr.term_id is null
  );

-- 3) Office hour sessions (read-only in Phase 06; check-in/out in later phases)
create table if not exists public.office_hour_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  office_location_id uuid null references public.office_locations(id) on delete restrict,
  checkin_at timestamptz not null,
  checkout_at timestamptz null,
  status text not null default 'open',
  within_radius boolean null,
  within_grace boolean null,
  distance_m_at_checkin integer null,
  distance_m_at_checkout integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_hour_sessions_status_check check (status in ('open','closed','auto_closed','voided')),
  constraint office_hour_sessions_time_check check (checkout_at is null or checkout_at >= checkin_at)
);

create index if not exists office_hour_sessions_user_id_idx on public.office_hour_sessions (user_id);
create index if not exists office_hour_sessions_checkin_at_idx on public.office_hour_sessions (checkin_at);

-- Only 1 open session per user
create unique index if not exists office_hour_sessions_single_open_uniq
  on public.office_hour_sessions (user_id)
  where status = 'open' and checkout_at is null;

alter table public.office_hour_sessions enable row level security;

create policy "office_hour_sessions_select_own"
  on public.office_hour_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "office_hour_sessions_select_admin"
  on public.office_hour_sessions
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop trigger if exists trg_office_hour_sessions_set_updated_at on public.office_hour_sessions;
create trigger trg_office_hour_sessions_set_updated_at
before update on public.office_hour_sessions
for each row
execute function public.set_updated_at();

-- 4) Approved exceptions (read-only in Phase 06)
create table if not exists public.office_hour_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start_date date not null,
  kind text not null,
  minutes integer not null,
  approved_by_user_id uuid null references public.profiles(id) on delete set null,
  reason text null,
  created_at timestamptz not null default now(),
  constraint office_hour_exceptions_kind_check check (kind in ('total','in_office')),
  constraint office_hour_exceptions_minutes_nonnegative check (minutes >= 0)
);

create index if not exists office_hour_exceptions_user_week_idx on public.office_hour_exceptions (user_id, week_start_date);

alter table public.office_hour_exceptions enable row level security;

create policy "office_hour_exceptions_select_own"
  on public.office_hour_exceptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "office_hour_exceptions_select_admin"
  on public.office_hour_exceptions
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- 5) Week helpers (ISO week = Monday start) in Pacific timezone.
create or replace function public.office_hours_week_start_date(ts timestamptz default now())
returns date
language sql
stable
as $$
  select (date_trunc('week', (ts at time zone 'America/Los_Angeles'))::date);
$$;

revoke all on function public.office_hours_week_start_date(timestamptz) from public;
grant execute on function public.office_hours_week_start_date(timestamptz) to authenticated;

-- 6) Role selection helper for requirements
create or replace function public.primary_role_key_for_requirements(_uid uuid)
returns text
language sql
stable
as $$
  with ct as (
    select public.current_term_id() as term_id
  ),
  active as (
    select ra.role_key, ra.is_primary
    from public.role_assignments ra
    join ct on true
    where ra.user_id = _uid
      and ra.ends_at is null
      and ra.term_id = ct.term_id
      and ra.role_key in ('president','officer','volunteer')
  ),
  ranked as (
    select
      role_key,
      row_number() over (
        order by
          case when is_primary then 0 else 1 end,
          case role_key when 'president' then 0 when 'officer' then 1 when 'volunteer' then 2 else 9 end
      ) as rn
    from active
  )
  select coalesce(
    (select role_key from ranked where rn = 1),
    'volunteer'
  );
$$;

revoke all on function public.primary_role_key_for_requirements(uuid) from public;
grant execute on function public.primary_role_key_for_requirements(uuid) to authenticated;

-- 7) Weekly rollup RPC for the current user
-- Matches the intended dashboard backing: v_my_weekly_hours(...) from 02_data_model.md.
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
    where s.checkout_at is not null
      and s.status in ('closed','auto_closed')
      and (s.checkin_at at time zone 'America/Los_Angeles') >= (wk.week_start::timestamp)
      and (s.checkin_at at time zone 'America/Los_Angeles') < ((wk.week_start + 7)::timestamp)
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

revoke all on function public.my_weekly_hours() from public;
grant execute on function public.my_weekly_hours() to authenticated;

-- Optional view for PostgREST/table-style access.
create or replace view public.v_my_weekly_hours as
select user_id, week_start, total_minutes, in_office_minutes, deficit_minutes
from public.my_weekly_hours();

grant select on public.v_my_weekly_hours to authenticated;

commit;
