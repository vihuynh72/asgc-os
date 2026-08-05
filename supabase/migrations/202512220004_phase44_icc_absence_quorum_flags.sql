-- PHASE 44 — ICC absence/quorum flags
-- Source of truth: ICC manual (2024) + ASGC bylaws Article IX

begin;

create table if not exists public.config_icc (
  id boolean primary key default true,
  quorum_ratio numeric(6,4) not null default 0.5,
  quorum_offset integer not null default 1,
  absence_warn_threshold integer not null default 1,
  absence_suspend_threshold integer not null default 2,
  absence_revoke_threshold integer not null default 3,
  advisor_required boolean not null default true,
  citations jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint config_icc_singleton check (id is true),
  constraint config_icc_quorum_ratio_check check (quorum_ratio >= 0 and quorum_ratio <= 1),
  constraint config_icc_thresholds_check check (
    absence_warn_threshold >= 0
    and absence_suspend_threshold >= absence_warn_threshold
    and absence_revoke_threshold >= absence_suspend_threshold
  )
);

alter table public.config_icc enable row level security;

create policy "config_icc_select_authenticated"
  on public.config_icc
  for select
  to authenticated
  using (true);

create policy "config_icc_update_admin"
  on public.config_icc
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

revoke all on table public.config_icc from authenticated;
grant select, update on table public.config_icc to authenticated;

insert into public.config_icc (id, citations)
values (
  true,
  jsonb_build_object(
    'quorum', 'ICC Manual 2024: Quorum defined as 50% + 1 of ICC membership.',
    'advisor', 'ICC Manual 2024: advisor present for official meeting.',
    'absence', 'ASGC Bylaws Article IX: absence thresholds + suspension/revocation.',
    'excused', 'ICC Constitution Article III Section 7: excused absences excluded from quorum.'
  )
)
on conflict (id) do update
set citations = excluded.citations;

drop trigger if exists trg_config_icc_set_updated_at on public.config_icc;
create trigger trg_config_icc_set_updated_at
before update on public.config_icc
for each row
execute function public.set_updated_at();

create or replace function public.icc_absence_summary(_term_id uuid default null)
returns table (
  club_id uuid,
  term_id uuid,
  unexcused_absences integer,
  excused_absences integer,
  present_count integer,
  absence_flag text,
  not_counted_for_quorum boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select *
    from public.config_icc
    where id = true
  ),
  resolved_term as (
    select coalesce(_term_id, public.current_term_id()) as term_id
  ),
  club_base as (
    select c.id, rt.term_id
    from public.clubs c
    cross join resolved_term rt
  ),
  attendance as (
    select a.club_id, m.term_id, a.status
    from public.icc_attendance a
    join public.icc_meetings m on m.id = a.icc_meeting_id
    join resolved_term rt on m.term_id = rt.term_id
    where m.called_to_order_at is not null
  ),
  grouped as (
    select
      b.id as club_id,
      b.term_id,
      count(*) filter (where a.status = 'absent')::int as unexcused_absences,
      count(*) filter (where a.status = 'excused')::int as excused_absences,
      count(*) filter (where a.status = 'present')::int as present_count
    from club_base b
    left join attendance a on a.club_id = b.id and a.term_id = b.term_id
    group by b.id, b.term_id
  )
  select
    g.club_id,
    g.term_id,
    g.unexcused_absences,
    g.excused_absences,
    g.present_count,
    case
      when g.unexcused_absences >= cfg.absence_revoke_threshold then 'revoked'
      when g.unexcused_absences >= cfg.absence_suspend_threshold then 'suspended'
      when g.unexcused_absences >= cfg.absence_warn_threshold then 'warning'
      else 'ok'
    end as absence_flag,
    (g.unexcused_absences >= cfg.absence_suspend_threshold) as not_counted_for_quorum
  from grouped g
  cross join cfg;
$$;

revoke all on function public.icc_absence_summary(uuid) from public;
grant execute on function public.icc_absence_summary(uuid) to authenticated;

create or replace function public.icc_quorum_summary(_meeting_id uuid)
returns table (
  meeting_id uuid,
  term_id uuid,
  member_count integer,
  excused_count integer,
  eligible_count integer,
  present_count integer,
  quorum_required integer,
  advisor_present boolean,
  quorum_met boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select *
    from public.config_icc
    where id = true
  ),
  meeting as (
    select *
    from public.icc_meetings
    where id = _meeting_id
  ),
  absence_flags as (
    select s.club_id, s.not_counted_for_quorum
    from meeting m
    join public.icc_absence_summary(m.term_id) s on true
  ),
  chartered as (
    select c.id
    from public.clubs c
    join meeting m on true
    where c.status = 'chartered'
      and (m.term_id is null or c.charter_term_id is null or c.charter_term_id = m.term_id)
  ),
  eligible_base as (
    select c.id
    from chartered c
    left join absence_flags f on f.club_id = c.id
    where coalesce(f.not_counted_for_quorum, false) = false
  ),
  excused as (
    select a.club_id
    from public.icc_attendance a
    where a.icc_meeting_id = _meeting_id
      and a.status = 'excused'
  ),
  eligible as (
    select e.id
    from eligible_base e
    where e.id not in (select club_id from excused)
  ),
  counts as (
    select
      (select count(*) from chartered)::int as member_count,
      (select count(*) from excused)::int as excused_count,
      (select count(*) from eligible)::int as eligible_count,
      (select count(*) from public.icc_attendance where icc_meeting_id = _meeting_id and status = 'present')::int as present_count
  )
  select
    m.id as meeting_id,
    m.term_id,
    c.member_count,
    c.excused_count,
    c.eligible_count,
    c.present_count,
    case
      when c.eligible_count = 0 then 0
      else floor(c.eligible_count * cfg.quorum_ratio)::int + cfg.quorum_offset
    end as quorum_required,
    m.advisor_present,
    (
      (not cfg.advisor_required or m.advisor_present)
      and c.present_count >= case
        when c.eligible_count = 0 then 0
        else floor(c.eligible_count * cfg.quorum_ratio)::int + cfg.quorum_offset
      end
    ) as quorum_met
  from meeting m
  cross join cfg
  cross join counts c;
$$;

revoke all on function public.icc_quorum_summary(uuid) from public;
grant execute on function public.icc_quorum_summary(uuid) to authenticated;

create or replace view public.v_icc_quorum_summary
with (security_invoker = true) as
select qs.*
from public.icc_meetings m
join lateral public.icc_quorum_summary(m.id) qs on true;

grant select on public.v_icc_quorum_summary to authenticated;

commit;
