-- PATCH — Admin office hours overrides (force checkout + exclude totals)
--
-- - Adds admin override columns on office_hour_sessions
-- - Adds admin_close_office_hour_session RPC
-- - Excludes admin_exclude_from_totals sessions from weekly rollups/reminders

begin;

alter table public.office_hour_sessions
  add column if not exists admin_closed_by uuid null references public.profiles(id) on delete set null,
  add column if not exists admin_closed_at timestamptz null,
  add column if not exists admin_closed_reason text null,
  add column if not exists admin_adjusted_checkout_at timestamptz null,
  add column if not exists admin_exclude_from_totals boolean not null default false;

create or replace function public.admin_close_office_hour_session(
  _session_id uuid,
  _checkout_at timestamptz,
  _exclude_from_totals boolean default false,
  _reason text
)
returns public.office_hour_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.office_hour_sessions;
  now_ts timestamptz := now();
  admin_info jsonb;
  admin_tier text;
  admin_is_evp boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  admin_tier := admin_info ->> 'tier';
  admin_is_evp := coalesce((admin_info ->> 'is_evp')::boolean, false);

  if admin_tier is null or (admin_tier <> 'full' and not (admin_is_evp and admin_tier = 'partial')) then
    raise exception 'forbidden';
  end if;

  if _session_id is null then
    raise exception 'session_id_required';
  end if;

  if _checkout_at is null then
    raise exception 'checkout_at_required';
  end if;

  if _reason is null or char_length(btrim(_reason)) = 0 then
    raise exception 'reason_required';
  end if;

  select * into sess
  from public.office_hour_sessions
  where id = _session_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if sess.status <> 'open' or sess.checkout_at is not null then
    raise exception 'session_not_open';
  end if;

  if _checkout_at < sess.checkin_at or _checkout_at > now_ts then
    raise exception 'invalid_checkout_time';
  end if;

  update public.office_hour_sessions
  set
    checkout_at = _checkout_at,
    status = 'closed',
    admin_closed_by = auth.uid(),
    admin_closed_at = now_ts,
    admin_closed_reason = _reason,
    admin_adjusted_checkout_at = _checkout_at,
    admin_exclude_from_totals = coalesce(_exclude_from_totals, false)
  where id = sess.id
  returning * into sess;

  perform public.log_event(
    'office_hours.admin_close',
    auth.uid(),
    'office_hour_session',
    sess.id,
    jsonb_build_object(
      'checkout_at', _checkout_at,
      'exclude_from_totals', coalesce(_exclude_from_totals, false),
      'reason', _reason
    )
  );

  return sess;
end;
$$;

revoke all on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) from public;
revoke all on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) from authenticated;
grant execute on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) to authenticated;
grant execute on function public.admin_close_office_hour_session(uuid, timestamptz, boolean, text) to service_role;

-- Member weekly rollup: closed-only + admin exclusions respected.
create or replace function public.my_weekly_hours(_week_start date default null)
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
  b as (
    select * from public.office_week_bounds(_week_start)
  ),
  role_sel as (
    select public.primary_role_key_for_requirements((select user_id from u)) as role_key
  ),
  req as (
    select
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes
    from public.office_hour_requirements ohr
    join role_sel rs on rs.role_key = ohr.role_key
    where (ohr.term_id is null or ohr.term_id = public.current_term_id())
      and (ohr.effective_start is null or ohr.effective_start <= (select week_start from b))
      and (ohr.effective_end is null or ohr.effective_end >= (select week_start from b))
    order by
      case when ohr.term_id is null then 1 else 0 end,
      ohr.effective_start desc nulls last,
      ohr.created_at desc
    limit 1
  ),
  session_minutes as (
    select
      coalesce(sum(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0), 0)::bigint as total_minutes
    from public.office_hour_sessions s
    join u on u.user_id = s.user_id
    join b on true
    where s.checkout_at is not null
      and s.status = 'closed'
      and coalesce(s.admin_exclude_from_totals, false) = false
      and s.checkin_at >= b.week_start_ts
      and s.checkin_at < b.week_end_ts
  ),
  exception_minutes as (
    select
      coalesce(sum(e.minutes), 0)::bigint as total_minutes
    from public.office_hour_exceptions e
    join u on u.user_id = e.user_id
    join b on b.week_start = e.week_start_date
  ),
  totals as (
    select
      (select user_id from u) as user_id,
      (select week_start from b) as week_start,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      (select req_total_minutes from req) as req_total_minutes
    from session_minutes sm, exception_minutes em
  )
  select
    user_id,
    week_start,
    total_minutes,
    total_minutes as in_office_minutes,
    greatest(coalesce(req_total_minutes, 0) - total_minutes, 0) as deficit_minutes,
    0::bigint as deficit_in_office_minutes
  from totals;
$$;

revoke all on function public.my_weekly_hours(date) from public;
grant execute on function public.my_weekly_hours(date) to authenticated;
grant execute on function public.my_weekly_hours(date) to service_role;

-- Admin weekly rollup (reporting fields): closed-only + admin exclusions respected.
drop function if exists public.admin_weekly_hours(date);

create or replace function public.admin_weekly_hours(_week_start date default null)
returns table (
  user_id uuid,
  week_start date,
  role_key text,
  required_total_minutes bigint,
  total_minutes bigint,
  deficit_minutes bigint,
  needs_review_sessions bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  wk date;
  b record;
  admin_info jsonb;
  admin_tier text;
  admin_is_evp boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  admin_info := public.get_admin_tier(auth.uid());
  admin_tier := admin_info ->> 'tier';
  admin_is_evp := coalesce((admin_info ->> 'is_evp')::boolean, false);

  if admin_tier is null or (admin_tier <> 'full' and not (admin_is_evp and admin_tier = 'partial')) then
    raise exception 'forbidden';
  end if;

  select * into b from public.office_week_bounds(_week_start) limit 1;
  wk := b.week_start;

  return query
  with
  users as (
    select
      p.id as user_id,
      public.primary_role_key_for_requirements(p.id) as role_key
    from public.profiles p
    join public.profile_private pp on pp.id = p.id
    where p.status = 'active'
      and pp.email is not null
      and public.is_email_allowlisted(pp.email) = true
  ),
  req as (
    select
      u.user_id,
      u.role_key,
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes
    from users u
    left join lateral (
      select ohr.*
      from public.office_hour_requirements ohr
      where ohr.role_key = u.role_key
        and (ohr.term_id is null or ohr.term_id = public.current_term_id())
        and (ohr.effective_start is null or ohr.effective_start <= wk)
        and (ohr.effective_end is null or ohr.effective_end >= wk)
      order by
        case when ohr.term_id is null then 1 else 0 end,
        ohr.effective_start desc nulls last,
        ohr.created_at desc
      limit 1
    ) ohr on true
  ),
  session_minutes as (
    select
      u.user_id,
      coalesce(sum(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0), 0)::bigint as total_minutes,
      coalesce(sum(case when coalesce(s.needs_review, false) then 1 else 0 end), 0)::bigint as needs_review_sessions
    from users u
    left join public.office_hour_sessions s
      on s.user_id = u.user_id
      and s.checkout_at is not null
      and s.status = 'closed'
      and coalesce(s.admin_exclude_from_totals, false) = false
      and s.checkin_at >= b.week_start_ts
      and s.checkin_at < b.week_end_ts
    group by u.user_id
  ),
  exception_minutes as (
    select
      u.user_id,
      coalesce(sum(e.minutes), 0)::bigint as total_minutes
    from users u
    left join public.office_hour_exceptions e
      on e.user_id = u.user_id
      and e.week_start_date = wk
    group by u.user_id
  ),
  totals as (
    select
      u.user_id,
      wk as week_start,
      r.role_key,
      coalesce(r.req_total_minutes, 0)::bigint as required_total_minutes,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      sm.needs_review_sessions
    from users u
    left join req r on r.user_id = u.user_id
    join session_minutes sm on sm.user_id = u.user_id
    join exception_minutes em on em.user_id = u.user_id
  )
  select
    t.user_id,
    t.week_start,
    t.role_key,
    t.required_total_minutes,
    t.total_minutes,
    greatest(t.required_total_minutes - t.total_minutes, 0) as deficit_minutes,
    t.needs_review_sessions
  from totals t
  order by
    case t.role_key
      when 'president' then 0
      when 'executive' then 1
      when 'director' then 2
      when 'board_member' then 3
      when 'volunteer' then 4
      else 9
    end,
    t.total_minutes desc;
end;
$$;

revoke all on function public.admin_weekly_hours(date) from public;
grant execute on function public.admin_weekly_hours(date) to service_role;

-- Weekly reminder candidates: use credited (closed-only) totals + admin exclusions.
drop function if exists public.enqueue_weekly_hours_reminders(timestamptz);
create or replace function public.enqueue_weekly_hours_reminders(_now timestamptz default now())
returns table (
  inserted integer,
  error text,
  week_start date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  enabled boolean;
  reminder_dow integer;
  reminder_time time;
  tz text;
  local_ts timestamp;
  local_date date;
  local_time time;
  local_dow integer;
  term_id uuid;
  term_start date;
  term_end date;
  wk date;
  inserted integer;
begin
  select
      oc.weekly_hours_reminder_enabled,
      oc.weekly_hours_reminder_weekday,
      oc.weekly_hours_reminder_time_local
    into enabled, reminder_dow, reminder_time
  from public.office_config oc
  where oc.id = true;

  if not found then
    return query select 0, 'office_config_missing', null::date;
    return;
  end if;

  if not enabled then
    return query select 0, 'disabled', null::date;
    return;
  end if;

  tz := public.office_timezone();
  local_ts := _now at time zone tz;
  local_date := local_ts::date;
  local_time := local_ts::time;
  local_dow := extract(isodow from local_ts)::int;

  if reminder_dow is null or reminder_time is null then
    return query select 0, 'schedule_missing', null::date;
    return;
  end if;

  if local_dow <> reminder_dow or local_time < reminder_time then
    return query select 0, 'schedule_not_due', null::date;
    return;
  end if;

  select t.id, t.start_date, t.end_date
    into term_id, term_start, term_end
  from public.terms t
  where t.is_current
  limit 1;

  if term_id is null then
    return query select 0, 'term_missing', null::date;
    return;
  end if;

  if term_start is null or term_end is null then
    return query select 0, 'term_dates_missing', null::date;
    return;
  end if;

  if local_date < term_start or local_date > term_end then
    return query select 0, 'outside_term', null::date;
    return;
  end if;

  wk := public.office_hours_week_start_date(_now);

  with
  b as (
    select * from public.office_week_bounds(wk)
  ),
  users as (
    select p.id as user_id
    from public.profiles p
    where p.status = 'active'
  ),
  req as (
    select
      u.user_id,
      coalesce(ohr.weekly_total_hours, 0) * 60 as req_total_minutes
    from users u
    left join lateral (
      select ohr.*
      from public.office_hour_requirements ohr
      where ohr.role_key = public.primary_role_key_for_requirements(u.user_id)
        and (ohr.term_id is null or ohr.term_id = public.current_term_id())
        and (ohr.effective_start is null or ohr.effective_start <= (select week_start from b))
        and (ohr.effective_end is null or ohr.effective_end >= (select week_start from b))
      order by
        case when ohr.term_id is null then 1 else 0 end,
        ohr.effective_start desc nulls last,
        ohr.created_at desc
      limit 1
    ) ohr on true
  ),
  session_minutes as (
    select
      u.user_id,
      coalesce(sum(extract(epoch from (s.checkout_at - s.checkin_at)) / 60.0), 0)::bigint as total_minutes
    from users u
    left join public.office_hour_sessions s
      on s.user_id = u.user_id
      and s.checkout_at is not null
      and s.status = 'closed'
      and coalesce(s.admin_exclude_from_totals, false) = false
      and s.checkin_at >= (select week_start_ts from b)
      and s.checkin_at < (select week_end_ts from b)
    group by u.user_id
  ),
  exception_minutes as (
    select
      u.user_id,
      coalesce(sum(e.minutes), 0)::bigint as total_minutes
    from users u
    left join public.office_hour_exceptions e
      on e.user_id = u.user_id
      and e.week_start_date = (select week_start from b)
    group by u.user_id
  ),
  totals as (
    select
      u.user_id,
      (select week_start from b) as week_start,
      (sm.total_minutes + em.total_minutes) as total_minutes,
      r.req_total_minutes
    from users u
    join req r on r.user_id = u.user_id
    join session_minutes sm on sm.user_id = u.user_id
    join exception_minutes em on em.user_id = u.user_id
  ),
  candidates as (
    select
      t.*,
      greatest(coalesce(t.req_total_minutes, 0) - t.total_minutes, 0) as deficit_minutes
    from totals t
    where greatest(coalesce(t.req_total_minutes, 0) - t.total_minutes, 0) > 0
  )
  insert into public.notification_log (
    actor_user_id,
    user_id,
    type,
    channel,
    provider,
    to_email,
    subject,
    status,
    send_after,
    dedupe_key,
    metadata
  )
  select
    null,
    c.user_id,
    'office_hours.weekly_hours_reminder',
    'email',
    'resend',
    pp.email,
    'Office hours reminder: hours remaining this week',
    'queued',
    public.defer_if_quiet_hours(_now),
    'office_hours.weekly_hours_reminder:' || c.user_id::text || ':' || c.week_start::text,
    jsonb_build_object(
      'week_start', c.week_start,
      'week_end', (c.week_start + 4),
      'total_minutes', c.total_minutes,
      'deficit_minutes', c.deficit_minutes,
      'required_total_minutes', c.req_total_minutes,
      'office_tz', tz
    )
  from candidates c
  join public.profile_private pp on pp.id = c.user_id
  where pp.email is not null
    and char_length(btrim(pp.email)) > 0
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted = row_count;

  return query select inserted, null::text, wk;
end;
$$;

revoke all on function public.enqueue_weekly_hours_reminders(timestamptz) from public;
revoke all on function public.enqueue_weekly_hours_reminders(timestamptz) from authenticated;
grant execute on function public.enqueue_weekly_hours_reminders(timestamptz) to service_role;

commit;
