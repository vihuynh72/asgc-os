-- PATCH — Office Hours admin calendar helpers
--
-- Adds a generic helper to convert a date range into timestamptz bounds in the configured
-- office timezone. This lets the app query sessions for day/week/month views accurately.

begin;

create or replace function public.office_date_bounds(_start_date date, _end_date date)
returns table (
  start_date date,
  end_date date,
  start_ts timestamptz,
  end_ts timestamptz,
  tz text
)
language sql
stable
as $$
  with tz as (
    select public.office_timezone() as tz
  )
  select
    _start_date as start_date,
    _end_date as end_date,
    (_start_date::timestamp at time zone (select tz from tz)) as start_ts,
    (_end_date::timestamp at time zone (select tz from tz)) as end_ts,
    (select tz from tz) as tz;
$$;

revoke all on function public.office_date_bounds(date, date) from public;
grant execute on function public.office_date_bounds(date, date) to authenticated;
grant execute on function public.office_date_bounds(date, date) to service_role;

commit;

